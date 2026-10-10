"""Tests for POST /chat (ticket #11): the agent scripted with a streaming FunctionModel and
WDS mocked at the httpx transport - no LLM, no live WDS, no OpenSearch."""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from typing import Any

import pytest
from fastapi.testclient import TestClient
from pydantic_ai.messages import ModelMessage, ModelResponse
from pydantic_ai.models.function import AgentInfo, DeltaToolCall, DeltaToolCalls, FunctionModel
from pydantic_ai.usage import UsageLimits
from pytest_httpx import HTTPXMock

from open_data_assistant.agent.agent import build_agent
from open_data_assistant.agent.deps import AgentDeps
from open_data_assistant.api.app import create_app
from open_data_assistant.api.chat import tool_label
from open_data_assistant.api.sessions import SessionStore
from open_data_assistant.wds.client import BASE_URL, WdsClient
from tests.agent.test_agent import ONTARIO_ANSWER_ARGS
from tests.fixtures.wds import load_wds_fixture
from tests.mcp.tools.test_search_tables import FakeEmbedder, FakeOpenSearchClient

Step = tuple[str, dict[str, Any]]

ONTARIO_DATA: Step = (
    "get_data",
    {
        "product_id": 14100287,
        "selections": {1: 7, 2: 7, 3: 1, 4: 1, 5: 1, 6: 1},
        "period": {"type": "latestN", "n": 1},
    },
)
ONTARIO_ANSWER: Step = ("final_result_Answer", ONTARIO_ANSWER_ARGS)

# Required fields per event, as in docs/chat-api.md - and frontend/src/chat/events.test.ts,
# which checks the frontend's mock streams against the same list.
REQUIRED = {
    "session": {"session_id", "message_id"},
    "tool_call": {"call_id", "label"},
    "tool_result": {"call_id", "ok"},
    "answer": {"message_id", "text", "values", "data_results"},
    "clarification": {"message_id", "question", "options"},
    "unanswerable": {"message_id", "reason", "alternative"},
    "error": {"message_id", "code", "message", "retryable"},
}
TERMINAL = {"answer", "clarification", "unanswerable", "error"}


def _scripted(steps: list[Step]) -> FunctionModel:
    """Plays back `steps`, one tool call per model request, streamed as a single chunk.
    Indexed by the responses already in the conversation, so it continues across turns."""

    async def stream(
        messages: list[ModelMessage], _info: AgentInfo
    ) -> AsyncIterator[DeltaToolCalls]:
        tool, args = steps[sum(isinstance(m, ModelResponse) for m in messages)]
        yield {0: DeltaToolCall(name=tool, json_args=json.dumps(args))}

    return FunctionModel(stream_function=stream)


def _client(
    steps: list[Step],
    *,
    search: FakeOpenSearchClient | None = None,
    sessions: SessionStore | None = None,
    usage_limits: UsageLimits | None = None,
) -> TestClient:
    def make_deps() -> AgentDeps:
        return AgentDeps(
            wds_client=WdsClient(),
            search_client=search or FakeOpenSearchClient([]),
            search_index="statcan-products",
            embedder=FakeEmbedder(),
        )

    kwargs: dict[str, Any] = {"sessions": sessions}
    if usage_limits is not None:
        kwargs["usage_limits"] = usage_limits
    return TestClient(create_app(build_agent(_scripted(steps)), make_deps, **kwargs))


def _mock(httpx_mock: HTTPXMock, method: str, path: str, fixture: str) -> None:
    body = load_wds_fixture(fixture)
    httpx_mock.add_response(
        method=method, url=f"{BASE_URL}/{path}", json=body["body"], status_code=body["http_status"]
    )


def _mock_ontario(httpx_mock: HTTPXMock) -> None:
    _mock(httpx_mock, "POST", "getCubeMetadata", "cube_metadata")
    _mock(httpx_mock, "GET", "getCodeSets", "code_sets")
    _mock(httpx_mock, "POST", "getDataFromCubePidCoordAndLatestNPeriods", "normal_data_point")


def _events(
    client: TestClient, message: str, session_id: str | None = None
) -> list[tuple[str, dict[str, Any]]]:
    response = client.post("/chat", json={"session_id": session_id, "message": message})
    assert response.status_code == 200, response.text
    assert response.headers["content-type"].startswith("text/event-stream")
    events = []
    for block in response.text.strip().split("\n\n"):
        name_line, data_line = block.split("\n")
        assert name_line.startswith("event: ") and data_line.startswith("data: ")
        events.append((name_line[7:], json.loads(data_line[6:])))
    _check_contract(events)
    return events


def _check_contract(events: list[tuple[str, dict[str, Any]]]) -> None:
    """Every stream follows docs/chat-api.md: session first, exactly one terminal event last,
    and every event carries its required fields."""
    assert events[0][0] == "session"
    assert [name for name, _ in events].count("answer") + sum(
        name in TERMINAL - {"answer"} for name, _ in events
    ) == 1
    assert events[-1][0] in TERMINAL
    for name, data in events:
        assert REQUIRED[name] <= data.keys(), (name, data)


def test_answer_stream(httpx_mock: HTTPXMock) -> None:
    _mock_ontario(httpx_mock)
    with _client([ONTARIO_DATA, ONTARIO_ANSWER]) as client:
        events = _events(client, "What's the unemployment rate in Ontario?")

    names = [name for name, _ in events]
    assert names == ["session", "tool_call", "tool_result", "answer"]
    session = events[0][1]
    assert session["message_id"] == "m1"
    assert events[1][1]["label"] == "Fetching data"
    assert events[2][1] == {"call_id": events[1][1]["call_id"], "ok": True}

    answer = events[-1][1]
    assert answer["message_id"] == "m1"
    assert answer["values"] == ONTARIO_ANSWER_ARGS["values"]
    [result] = answer["data_results"]
    assert result["coordinate"] == "7.7.1.1.1.1.0.0.0.0"
    assert result["series"][0]["value"] == 6.9
    assert answer["related_tables"] == []


def test_follow_up_reuses_the_session_and_its_earlier_data(httpx_mock: HTTPXMock) -> None:
    _mock_ontario(httpx_mock)
    follow_up: Step = (
        "final_result_Answer",
        {**ONTARIO_ANSWER_ARGS, "text": ONTARIO_ANSWER_ARGS["text"] + " Table 14100287."},
    )
    # The similar-tables fallback runs for the follow-up, which didn't search.
    search = FakeOpenSearchClient([{"hits": {"hits": []}}])
    with _client([ONTARIO_DATA, ONTARIO_ANSWER, follow_up], search=search) as client:
        first = _events(client, "What's the unemployment rate in Ontario?")
        session_id = first[0][1]["session_id"]
        second = _events(client, "Which table was that from?", session_id)

    assert second[0][1] == {"session_id": session_id, "message_id": "m2"}
    # No tool calls this turn: the answer cites data fetched in turn 1.
    assert [name for name, _ in second] == ["session", "answer"]
    assert second[-1][1]["data_results"][0]["coordinate"] == "7.7.1.1.1.1.0.0.0.0"


def test_a_search_failure_never_breaks_the_answer(httpx_mock: HTTPXMock) -> None:
    """The run didn't search, so related tables fall back to OpenSearch - which fails here
    (the fake has no responses). The answer must still arrive, just without suggestions."""
    _mock_ontario(httpx_mock)
    with _client([ONTARIO_DATA, ONTARIO_ANSWER]) as client:
        events = _events(client, "Ontario unemployment")

    assert events[-1][0] == "answer"
    assert events[-1][1]["related_tables"] == []


def test_related_tables_come_from_the_runs_search(httpx_mock: HTTPXMock) -> None:
    _mock_ontario(httpx_mock)
    hit = {
        "_id": "14100374",
        "_score": 0.03,
        "_source": {
            "product_id": "14100374",
            "title": {"en": "Employment and unemployment rate, monthly"},
            "subjects": [{"code": "14", "en": "Labour"}],
            "frequency": {"code": "6", "en": "Monthly"},
            "coverage": {"start_date": "2011-01-01", "end_date": "2026-08-01"},
            "archived": False,
        },
    }
    # Hybrid search: one BM25 and one kNN response.
    search = FakeOpenSearchClient([{"hits": {"hits": [hit]}}, {"hits": {"hits": [hit]}}])
    steps: list[Step] = [
        ("search_tables", {"query": "unemployment Ontario"}),
        ONTARIO_DATA,
        ONTARIO_ANSWER,
    ]
    with _client(steps, search=search) as client:
        events = _events(client, "What's the unemployment rate in Ontario?")

    assert events[1][1]["label"] == "Searching StatCan tables"
    [related] = events[-1][1]["related_tables"]
    assert related["product_id"] == 14100374


def test_clarification_and_unanswerable_streams() -> None:
    clarify: Step = (
        "final_result_Clarification",
        {"question": "Which inflation measure?", "options": ["CPI", "Core CPI"]},
    )
    unanswerable: Step = (
        "final_result_Unanswerable",
        {"reason": "No such data.", "alternative": None},
    )
    with _client([clarify, unanswerable]) as client:
        first = _events(client, "What's inflation?")
        second = _events(client, "Population of Mars?", first[0][1]["session_id"])

    assert first[-1] == (
        "clarification",
        {
            "message_id": "m1",
            "question": "Which inflation measure?",
            "options": ["CPI", "Core CPI"],
        },
    )
    assert second[-1] == (
        "unanswerable",
        {"message_id": "m2", "reason": "No such data.", "alternative": None},
    )


def test_a_failed_tool_call_is_progress_not_an_error(httpx_mock: HTTPXMock) -> None:
    _mock_ontario(httpx_mock)
    bad_args: Step = ("get_data", {"product_id": 14100287, "selections": {}, "period": {"n": 1}})
    with _client([bad_args, ONTARIO_DATA, ONTARIO_ANSWER]) as client:
        events = _events(client, "Ontario unemployment")

    results = [data for name, data in events if name == "tool_result"]
    assert [r["ok"] for r in results] == [False, True]
    assert results[0]["message"]
    assert events[-1][0] == "answer"


def test_wds_maintenance_window_becomes_an_error_event(httpx_mock: HTTPXMock) -> None:
    httpx_mock.add_response(method="POST", url=f"{BASE_URL}/getCubeMetadata", status_code=409)
    with _client([("get_table_structure", {"product_id": 14100287})]) as client:
        events = _events(client, "Ontario unemployment")

    name, data = events[-1]
    assert name == "error"
    assert data["code"] == "wds_unavailable"
    assert data["retryable"] is True
    assert "8:30 AM ET" in data["message"]


def test_validator_giving_up_becomes_validation_failed(httpx_mock: HTTPXMock) -> None:
    _mock_ontario(httpx_mock)
    undated: Step = (
        "final_result_Answer",
        {**ONTARIO_ANSWER_ARGS, "text": "Ontario's unemployment rate is 6.9% [1]."},
    )
    with _client([ONTARIO_DATA, undated, undated, undated]) as client:
        events = _events(client, "Ontario unemployment")

    assert events[-1][0] == "error"
    assert events[-1][1]["code"] == "validation_failed"


def test_usage_limit_becomes_limit_exceeded(httpx_mock: HTTPXMock) -> None:
    _mock(httpx_mock, "POST", "getCubeMetadata", "cube_metadata")
    _mock(httpx_mock, "GET", "getCodeSets", "code_sets")
    steps: list[Step] = [("get_table_structure", {"product_id": 14100287})] * 4
    with _client(steps, usage_limits=UsageLimits(tool_calls_limit=2)) as client:
        events = _events(client, "Loop")

    assert events[-1][1]["code"] == "limit_exceeded"
    assert events[-1][1]["retryable"] is False


def test_a_failed_turn_does_not_join_the_history(httpx_mock: HTTPXMock) -> None:
    httpx_mock.add_response(method="POST", url=f"{BASE_URL}/getCubeMetadata", status_code=409)
    sessions = SessionStore()
    with _client([("get_table_structure", {"product_id": 14100287})], sessions=sessions) as client:
        events = _events(client, "Ontario unemployment")
    session = sessions.get(events[0][1]["session_id"])
    assert session is not None
    assert session.messages == []
    assert not session.lock.locked()


def test_invalid_request_is_a_400() -> None:
    with _client([]) as client:
        for body in ({"message": ""}, {"message": "x" * 2001}, {}):
            response = client.post("/chat", json=body)
            assert response.status_code == 400
            assert "message" in response.json()["detail"]


def test_unknown_session_is_a_404() -> None:
    with _client([]) as client:
        response = client.post("/chat", json={"session_id": "nope", "message": "hi"})
    assert response.status_code == 404


@pytest.mark.anyio
async def test_a_session_already_answering_is_a_409() -> None:
    sessions = SessionStore()
    session = sessions.create()
    await session.lock.acquire()
    with _client([], sessions=sessions) as client:
        response = client.post("/chat", json={"session_id": session.id, "message": "hi"})
    assert response.status_code == 409


def test_idle_sessions_expire() -> None:
    now = [0.0]
    sessions = SessionStore(idle_seconds=10, clock=lambda: now[0])
    session = sessions.create()
    now[0] = 5
    assert sessions.get(session.id) is session  # use refreshes the idle timer
    now[0] = 16
    assert sessions.get(session.id) is None


@pytest.mark.parametrize(
    ("tool", "args", "label"),
    [
        ("search_tables", {"query": "cpi"}, "Searching StatCan tables"),
        ("get_table_structure", {"product_id": 1}, "Reading the table's structure"),
        ("find_members", {"query": "Ontario"}, 'Finding "Ontario"'),
        ("get_data", {"selections": {"1": [14, 23], "2": 2}}, "Fetching data for 2 series"),
        (
            "get_data",
            {"selections": {"1": [2, 3, 4], "2": 7, "3": [2, 3]}},
            "Fetching data for 6 series",
        ),
        ("get_data", {"selections": {"1": 14}}, "Fetching data"),
    ],
)
def test_tool_labels(tool: str, args: dict[str, Any], label: str) -> None:
    assert tool_label(tool, args) == label
