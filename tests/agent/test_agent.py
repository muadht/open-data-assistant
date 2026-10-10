"""Tests for the agent wiring (ticket #8): tool registration, conversation-history
threading across turns, and validation-error retry - all against a scripted FunctionModel,
never a live LLM. End-to-end cases replay real fixtures from tests/fixtures/wds/ and
cross-check against docs/question-catalogue-eval.xlsx rows 1, 9, and 12.
"""

from __future__ import annotations

from typing import Any

import pytest
from pydantic_ai.messages import (
    ModelMessage,
    ModelResponse,
    RetryPromptPart,
    TextPart,
    ToolCallPart,
    ToolReturnPart,
)
from pydantic_ai.models.function import AgentInfo, FunctionModel
from pytest_httpx import HTTPXMock

from open_data_assistant.agent.agent import AgentDeps, build_agent
from open_data_assistant.mcp.schemas import DataResult
from open_data_assistant.wds.client import BASE_URL, WdsClient
from tests.fixtures.wds import load_wds_fixture

Step = tuple[str, dict[str, Any]] | str


def _mock(httpx_mock: HTTPXMock, method: str, path: str, fixture_name: str) -> None:
    fixture = load_wds_fixture(fixture_name)
    httpx_mock.add_response(
        method=method,
        url=f"{BASE_URL}/{path}",
        json=fixture["body"],
        status_code=fixture["http_status"],
    )


def _scripted_model(steps: list[Step]) -> FunctionModel:
    """A FunctionModel that plays back `steps` in order - one per model invocation. The
    step index is the number of ModelResponses already in the conversation, so this
    continues correctly across separate run_sync() calls that share message_history, and
    also continues correctly after a validation-error retry (which adds a new request, not
    a new response, so the index doesn't skip ahead)."""

    def respond(messages: list[ModelMessage], _info: AgentInfo) -> ModelResponse:
        index = sum(1 for m in messages if isinstance(m, ModelResponse))
        step = steps[index]
        if isinstance(step, str):
            return ModelResponse(parts=[TextPart(content=step)])
        tool_name, args = step
        return ModelResponse(parts=[ToolCallPart(tool_name=tool_name, args=args)])

    return FunctionModel(respond)


def _deps() -> AgentDeps:
    return AgentDeps(
        wds_client=WdsClient(),
        search_client=_UnusedSearchClient(),
        search_index="statcan-products",
        embedder=_UnusedEmbedder(),
    )


class _UnusedSearchClient:
    """search_tables needs OpenSearch, which this repo deliberately doesn't run yet (see
    CLAUDE.md) - none of these tests exercise it, so this exists only to satisfy AgentDeps'
    type and is never called."""

    def search(self, *, index: str, body: dict[str, Any]) -> dict[str, Any]:
        raise AssertionError("search_tables should not be called in these tests")


class _UnusedEmbedder:
    dimension = 0

    def embed(self, texts: list[str]) -> list[list[float]]:
        raise AssertionError("search_tables should not be called in these tests")


def _tool_returns(messages: list[ModelMessage], tool_name: str) -> list[Any]:
    returns = []
    for message in messages:
        if isinstance(message, ModelResponse):
            continue
        for part in message.parts:
            if isinstance(part, ToolReturnPart) and part.tool_name == tool_name:
                returns.append(part.content)
    return returns


def test_multi_turn_conversation_threads_history(httpx_mock: HTTPXMock) -> None:
    # get_table_structure and get_data both need getCubeMetadata/getCodeSets, but the shared
    # WdsClient caches them, so each is requested once.
    _mock(httpx_mock, "POST", "getCubeMetadata", "cube_metadata")
    _mock(httpx_mock, "GET", "getCodeSets", "code_sets")
    _mock(httpx_mock, "POST", "getSeriesInfoFromCubePidCoord", "normal_series_info")
    _mock(httpx_mock, "POST", "getDataFromVectorsAndLatestNPeriods", "normal_data_point")

    selections = {1: 7, 2: 7, 3: 1, 4: 1, 5: 1, 6: 1}
    steps: list[Step] = [
        ("get_table_structure", {"product_id": 14100287}),
        (
            "get_data",
            {
                "product_id": 14100287,
                "selections": selections,
                "period": {"type": "latestN", "n": 1},
            },
        ),
        "The unemployment rate in Ontario was 6.9% as of 2026-08, from table 14100287 "
        "(status: normal).",
        "That answer came from Statistics Canada table 14100287, reference period 2026-08.",
    ]
    agent = build_agent(_scripted_model(steps))
    deps = _deps()

    with deps.wds_client:
        result1 = agent.run_sync("What's the unemployment rate in Ontario?", deps=deps)
        assert result1.output == steps[2]

        # Turn 2 shares history - if it weren't threaded through, the step index would
        # reset to 0 and this would try to call get_table_structure again, which would
        # fail outright since only one getCubeMetadata response was ever registered.
        result2 = agent.run_sync(
            "Which table was that from?", message_history=result1.all_messages(), deps=deps
        )

    assert result2.output == steps[3]


def test_invalid_tool_args_trigger_a_retry_not_a_crash(httpx_mock: HTTPXMock) -> None:
    _mock(httpx_mock, "POST", "getCubeMetadata", "cube_metadata")
    _mock(httpx_mock, "GET", "getCodeSets", "code_sets")
    _mock(httpx_mock, "POST", "getSeriesInfoFromCubePidCoord", "normal_series_info")
    _mock(httpx_mock, "POST", "getDataFromVectorsAndLatestNPeriods", "normal_data_point")

    selections = {1: 7, 2: 7, 3: 1, 4: 1, 5: 1, 6: 1}
    steps: list[Step] = [
        # Missing the "type" discriminator - fails Pydantic validation before get_data ever runs.
        ("get_data", {"product_id": 14100287, "selections": selections, "period": {"n": 1}}),
        (
            "get_data",
            {
                "product_id": 14100287,
                "selections": selections,
                "period": {"type": "latestN", "n": 1},
            },
        ),
        "The unemployment rate in Ontario was 6.9%.",
    ]
    agent = build_agent(_scripted_model(steps))
    deps = _deps()

    with deps.wds_client:
        result = agent.run_sync("What's the unemployment rate in Ontario?", deps=deps)

    assert result.output == steps[2]
    retries = [
        p
        for m in result.all_messages()
        if not isinstance(m, ModelResponse)
        for p in m.parts
        if isinstance(p, RetryPromptPart) and p.tool_name == "get_data"
    ]
    assert len(retries) == 1


def test_business_rule_error_triggers_a_retry_not_a_crash(httpx_mock: HTTPXMock) -> None:
    """A ValueError raised from *inside* get_data (not a Pydantic argument-validation
    failure, e.g. a coordinate that resolves to no real series) must also become a
    ModelRetry the model can react to, not an unhandled exception that crashes the run -
    see agent/tools.py's _retry_on_value_error."""
    _mock(httpx_mock, "POST", "getCubeMetadata", "cube_metadata")
    _mock(httpx_mock, "GET", "getCodeSets", "code_sets")
    _mock(httpx_mock, "POST", "getSeriesInfoFromCubePidCoord", "nonexistent_coordinate")
    _mock(httpx_mock, "POST", "getSeriesInfoFromCubePidCoord", "normal_series_info")
    _mock(httpx_mock, "POST", "getDataFromVectorsAndLatestNPeriods", "normal_data_point")

    # Geography member 99 doesn't exist on this table (see nonexistent_coordinate.json) -
    # the agent should recover by correcting it to the real Ontario member (7).
    bad_selections = {1: 99, 2: 7, 3: 1, 4: 1, 5: 1, 6: 1}
    good_selections = {1: 7, 2: 7, 3: 1, 4: 1, 5: 1, 6: 1}
    steps: list[Step] = [
        (
            "get_data",
            {
                "product_id": 14100287,
                "selections": bad_selections,
                "period": {"type": "latestN", "n": 1},
            },
        ),
        (
            "get_data",
            {
                "product_id": 14100287,
                "selections": good_selections,
                "period": {"type": "latestN", "n": 1},
            },
        ),
        "The unemployment rate in Ontario was 6.9%.",
    ]
    agent = build_agent(_scripted_model(steps))
    deps = _deps()

    with deps.wds_client:
        result = agent.run_sync("What's the unemployment rate in Ontario?", deps=deps)

    assert result.output == steps[2]
    retries = [
        p
        for m in result.all_messages()
        if not isinstance(m, ModelResponse)
        for p in m.parts
        if isinstance(p, RetryPromptPart) and p.tool_name == "get_data"
    ]
    assert len(retries) == 1
    assert "No series exists" in str(retries[0].content)


def test_end_to_end_normal_question(httpx_mock: HTTPXMock) -> None:
    """question-catalogue-eval.xlsx row 1: full chain including find_members."""
    # get_table_structure, find_members, and get_data all need getCubeMetadata (and two of
    # them getCodeSets), but the shared WdsClient caches both, so each is requested once.
    _mock(httpx_mock, "POST", "getCubeMetadata", "cube_metadata")
    _mock(httpx_mock, "GET", "getCodeSets", "code_sets")
    _mock(httpx_mock, "POST", "getSeriesInfoFromCubePidCoord", "normal_series_info")
    _mock(httpx_mock, "POST", "getDataFromVectorsAndLatestNPeriods", "normal_data_point")

    selections = {1: 7, 2: 7, 3: 1, 4: 1, 5: 1, 6: 1}
    steps: list[Step] = [
        ("get_table_structure", {"product_id": 14100287}),
        ("find_members", {"product_id": 14100287, "dimension_position_id": 1, "query": "Ontario"}),
        (
            "get_data",
            {
                "product_id": 14100287,
                "selections": selections,
                "period": {"type": "latestN", "n": 1},
            },
        ),
        "The unemployment rate in Ontario was 6.9% as of 2026-08, from table 14100287 "
        "(status: normal).",
    ]
    agent = build_agent(_scripted_model(steps))
    deps = _deps()

    with deps.wds_client:
        result = agent.run_sync("What's the unemployment rate in Ontario?", deps=deps)

    [data_result] = _tool_returns(result.all_messages(), "get_data")
    assert isinstance(data_result, DataResult)
    assert data_result.product_id == 14100287
    assert data_result.vector_id == 2063949
    assert data_result.series[0].value == 6.9


def test_end_to_end_scalar_factor_question(httpx_mock: HTTPXMock) -> None:
    """question-catalogue-eval.xlsx row 9 (GDP): skips get_table_structure and find_members
    - the model already has resolved selections (e.g. from earlier context), which is valid
    per the system prompt's "skip steps you don't need" guidance. gdp_cube_metadata.json is
    trimmed to title-only (see its description), so it can't back a get_table_structure call
    anyway - this test only exercises get_data's own routing."""
    _mock(httpx_mock, "POST", "getCubeMetadata", "gdp_cube_metadata")
    _mock(httpx_mock, "GET", "getCodeSets", "code_sets")
    _mock(httpx_mock, "POST", "getSeriesInfoFromCubePidCoord", "gdp_series_info")
    _mock(httpx_mock, "POST", "getDataFromVectorsAndLatestNPeriods", "gdp_data_point")

    selections = {1: 1, 2: 2, 3: 1, 4: 30}
    steps: list[Step] = [
        (
            "get_data",
            {
                "product_id": 36100104,
                "selections": selections,
                "period": {"type": "latestN", "n": 1},
            },
        ),
        "Canada's GDP was approximately $3.44 trillion in Q2 2026, from table 36100104.",
    ]
    agent = build_agent(_scripted_model(steps))
    deps = _deps()

    with deps.wds_client:
        result = agent.run_sync("What's Canada's GDP?", deps=deps)

    [data_result] = _tool_returns(result.all_messages(), "get_data")
    assert isinstance(data_result, DataResult)
    assert data_result.series[0].value == pytest.approx(3437720.0 * 10**6)


def test_end_to_end_census_question_has_no_vector_id(httpx_mock: HTTPXMock) -> None:
    """question-catalogue-eval.xlsx row 12 (Census): skips get_table_structure and
    find_members entirely - the model already knows (e.g. from earlier context) that this
    is the Census table and coordinate. Exercises get_data's own Census routing."""
    _mock(httpx_mock, "POST", "getCubeMetadata", "census_cube_metadata")
    _mock(httpx_mock, "GET", "getCodeSets", "code_sets")
    _mock(httpx_mock, "POST", "getSeriesInfoFromCubePidCoord", "census_series_info")
    _mock(httpx_mock, "POST", "getDataFromCubePidCoordAndLatestNPeriods", "census_data_point")

    selections = {1: 7, 2: 1}
    steps: list[Step] = [
        (
            "get_data",
            {
                "product_id": 98100001,
                "selections": selections,
                "period": {"type": "latestN", "n": 1},
            },
        ),
        "Ontario's population in the 2021 Census was 14,223,942, from table 98100001.",
    ]
    agent = build_agent(_scripted_model(steps))
    deps = _deps()

    with deps.wds_client:
        result = agent.run_sync("What was Ontario's population in the 2021 Census?", deps=deps)

    [data_result] = _tool_returns(result.all_messages(), "get_data")
    assert isinstance(data_result, DataResult)
    assert data_result.vector_id is None
    assert data_result.series[0].value == 14223942.0
