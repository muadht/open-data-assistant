"""Tests for the /tables endpoints (#56) and /chat's table_id - fake OpenSearch client, WDS
mocked at the httpx transport, scripted model."""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from typing import Any

from fastapi.testclient import TestClient
from pydantic_ai.messages import ModelMessage
from pydantic_ai.models.function import AgentInfo, DeltaToolCall, DeltaToolCalls, FunctionModel
from pytest_httpx import HTTPXMock

from open_data_assistant.agent.agent import build_agent
from open_data_assistant.agent.deps import AgentDeps
from open_data_assistant.api.app import create_app
from open_data_assistant.wds.client import BASE_URL, WdsClient
from tests.fixtures.wds import load_wds_fixture
from tests.mcp.tools.test_search_tables import FakeEmbedder, FakeOpenSearchClient, _response
from tests.search.test_browse import PRICES, _aggregations, _listing, _source


def _client(search: FakeOpenSearchClient, model: FunctionModel | None = None) -> TestClient:
    def make_deps() -> AgentDeps:
        return AgentDeps(
            wds_client=WdsClient(),
            search_client=search,
            search_index="statcan-products",
            embedder=FakeEmbedder(),
        )

    agent = build_agent(model or FunctionModel(lambda _m, _i: None))  # type: ignore[arg-type, return-value]
    return TestClient(create_app(agent, make_deps))


def test_search_returns_tables_and_filter_counts() -> None:
    search = FakeOpenSearchClient(
        [
            _listing(43, ("18100004", _source("18100004", subjects=[PRICES]))),
            _aggregations({PRICES: 43, "Labour": 9}, {"Monthly": 43}),
        ]
    )
    with _client(search) as client:
        response = client.get("/tables/search", params={"frequency": "Monthly", "page": 1})

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 43
    assert body["page_size"] == 20
    [table] = body["results"]
    assert table["product_id"] == 18100004
    assert table["last_released"] == "2026-09-14"
    assert body["facets"]["subjects"][0] == {"value": PRICES, "count": 43}
    assert body["facets"]["frequencies"] == [{"value": "Monthly", "count": 43}]
    assert (body["facets"]["active"], body["facets"]["archived"]) == (40, 7)


def test_bad_query_parameters_are_a_400() -> None:
    with _client(FakeOpenSearchClient([])) as client:
        response = client.get("/tables/search", params={"page": 0})
    assert response.status_code == 400
    assert "page" in response.json()["detail"]


def test_table_details_combine_the_catalogue_and_the_structure(httpx_mock: HTTPXMock) -> None:
    for method, path, fixture in [
        ("POST", "getCubeMetadata", "cube_metadata"),
        ("GET", "getCodeSets", "code_sets"),
    ]:
        httpx_mock.add_response(
            method=method, url=f"{BASE_URL}/{path}", json=load_wds_fixture(fixture)["body"]
        )
    source = _source("14100287", subjects=["Labour", "Labour/Employment and unemployment"])
    with _client(FakeOpenSearchClient([_response(("14100287", 1.0, source))])) as client:
        response = client.get("/tables/14100287")

    assert response.status_code == 200
    body = response.json()
    assert body["table"]["product_id"] == 14100287
    assert body["subjects"] == ["Labour", "Labour/Employment and unemployment"]
    gender = next(d for d in body["structure"]["dimensions"] if d["name_en"] == "Gender")
    assert gender["members"][0]["name_en"] == "Total - Gender"
    assert body["source_url"].endswith("pid=1410028701")


def test_unknown_table_is_a_404() -> None:
    with _client(FakeOpenSearchClient([_response()])) as client:
        assert client.get("/tables/99999999").status_code == 404


def test_related_tables() -> None:
    search = FakeOpenSearchClient(
        [
            _response(("18100004", 1.0, {"embedding": [0.1, 0.2, 0.3]})),
            _response(
                ("18100004", 1.0, _source("18100004", subjects=[PRICES])),
                ("18100006", 0.9, _source("18100006", subjects=[PRICES])),
            ),
        ]
    )
    with _client(search) as client:
        response = client.get("/tables/18100004/related")

    assert [t["product_id"] for t in response.json()] == [18100006]


def test_chat_with_a_pinned_table_tells_the_agent_to_use_it() -> None:
    seen: list[str | None] = []

    async def stream(
        _messages: list[ModelMessage], info: AgentInfo
    ) -> AsyncIterator[DeltaToolCalls]:
        seen.append(info.instructions)
        args: dict[str, Any] = {"reason": "Not in this table.", "alternative": None}
        yield {0: DeltaToolCall(name="final_result_Unanswerable", json_args=json.dumps(args))}

    with _client(FakeOpenSearchClient([]), FunctionModel(stream_function=stream)) as client:
        response = client.post("/chat", json={"message": "Population?", "table_id": 18100004})

    assert response.status_code == 200
    [instructions] = seen
    assert instructions is not None
    assert "chosen table 18100004" in instructions
    assert "skip search_tables" in instructions
