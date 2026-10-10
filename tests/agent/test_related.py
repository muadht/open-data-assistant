"""Tests for an answer's related tables (#54) - fake OpenSearch client, no live services."""

from __future__ import annotations

from typing import Any

from pydantic_ai.messages import ModelMessage, ModelRequest, ToolReturnPart

from open_data_assistant.agent.deps import AgentDeps
from open_data_assistant.agent.related import related_tables
from open_data_assistant.mcp.schemas import DateRange, TableCandidate
from open_data_assistant.wds.client import WdsClient
from tests.mcp.tools.test_search_tables import (
    FakeEmbedder,
    FakeOpenSearchClient,
    _response,
    _source,
)


def _candidate(product_id: int) -> TableCandidate:
    return TableCandidate(
        product_id=product_id,
        title_en=f"Table {product_id}",
        subjects=["Prices"],
        frequency="Monthly",
        date_range=DateRange(start="1992-01-01", end="2026-08-01"),
        is_active=True,
        score=0.03,
    )


def _searched(content: list[Any]) -> list[ModelMessage]:
    return [
        ModelRequest(
            parts=[ToolReturnPart(tool_name="search_tables", content=content, tool_call_id="s1")]
        )
    ]


def _deps(search_client: FakeOpenSearchClient | None = None) -> AgentDeps:
    return AgentDeps(
        wds_client=WdsClient(),
        search_client=search_client or FakeOpenSearchClient([]),
        search_index="statcan-products",
        embedder=FakeEmbedder(),
    )


def test_uses_this_runs_search_results_minus_the_tables_the_answer_used() -> None:
    messages = _searched([_candidate(p) for p in (18100004, 18100006, 18100256, 18100006)])

    related = related_tables(messages, [18100004], _deps())

    # Search rank order, the used table removed, duplicates collapsed, no OpenSearch call.
    assert [c.product_id for c in related] == [18100006, 18100256]


def test_reads_search_results_from_a_reloaded_history() -> None:
    messages = _searched([_candidate(18100006).model_dump(mode="json")])

    assert [c.product_id for c in related_tables(messages, [18100004], _deps())] == [18100006]


def test_caps_the_number_of_suggestions() -> None:
    messages = _searched([_candidate(p) for p in range(1, 10)])

    assert len(related_tables(messages, [], _deps(), limit=3)) == 3


def test_falls_back_to_similar_tables_when_the_run_did_not_search() -> None:
    client = FakeOpenSearchClient(
        [
            # 1. The used table's stored embedding.
            _response(("18100004", 1.0, {"embedding": [0.1, 0.2, 0.3]})),
            # 2. Its nearest neighbours - which include itself.
            _response(
                ("18100004", 1.0, _source("18100004")),
                ("18100006", 0.9, _source("18100006")),
                ("18100256", 0.8, _source("18100256")),
            ),
        ]
    )

    related = related_tables([], [18100004], _deps(client))

    assert [c.product_id for c in related] == [18100006, 18100256]
    lookup, knn = (call["body"] for call in client.calls)
    assert lookup["query"] == {"ids": {"values": ["18100004"]}}
    assert knn["query"]["knn"]["embedding"]["vector"] == [0.1, 0.2, 0.3]
    # Only active tables are suggested.
    assert knn["query"]["knn"]["embedding"]["filter"] == {
        "bool": {"filter": [{"term": {"archived": False}}]}
    }


def test_no_suggestions_when_the_used_table_has_no_embedding() -> None:
    client = FakeOpenSearchClient([_response()])

    assert related_tables([], [18100004], _deps(client)) == []
    assert len(client.calls) == 1


def test_no_suggestions_without_search_results_or_a_used_table() -> None:
    assert related_tables([], [], _deps()) == []
