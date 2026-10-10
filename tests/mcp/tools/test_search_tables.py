"""Tests for the search_tables MCP tool (ticket #7).

No live OpenSearch - everything here exercises the query-parsing, filter-merging, and
candidate-mapping logic against a fake client and a fake embedder.
"""

from __future__ import annotations

from typing import Any

from open_data_assistant.mcp.schemas import TableSearchFilters
from open_data_assistant.mcp.tools.search_tables import search_tables


class FakeOpenSearchClient:
    def __init__(self, responses: list[dict[str, Any]]) -> None:
        self._responses = list(responses)
        self.calls: list[dict[str, Any]] = []

    def search(self, *, index: str, body: dict[str, Any]) -> dict[str, Any]:
        self.calls.append({"index": index, "body": body})
        return self._responses.pop(0)


class FakeEmbedder:
    dimension = 3

    def embed(self, texts: list[str]) -> list[list[float]]:
        return [[0.1, 0.2, 0.3] for _ in texts]


def _source(product_id: str, *, archived: bool = False) -> dict[str, Any]:
    return {
        "product_id": product_id,
        "title": {"en": f"Table {product_id}"},
        "subjects": [{"code": "35", "en": "Labour"}],
        "frequency": {"code": "6", "en": "Monthly"},
        "coverage": {"start_date": "1976-01-01", "end_date": "2026-08-01"},
        "archived": archived,
    }


def _response(*hits: tuple[str, float, dict[str, Any]]) -> dict[str, Any]:
    return {
        "hits": {
            "hits": [
                {"_id": doc_id, "_score": score, "_source": source}
                for doc_id, score, source in hits
            ]
        }
    }


def test_explicit_product_id_short_circuits_to_exact_lookup_not_fusion():
    client = FakeOpenSearchClient([_response(("14100287", 10.0, _source("14100287")))])

    candidates = search_tables(client, "statcan-products", FakeEmbedder(), "14100287")

    assert len(candidates) == 1
    assert candidates[0].product_id == 14100287
    # Only one search call (the BM25 exact lookup) - no second kNN call for fusion.
    assert len(client.calls) == 1


def test_ambiguous_query_can_return_multiple_candidates():
    client = FakeOpenSearchClient(
        [
            _response(
                ("18100004", 8.0, _source("18100004")), ("18100256", 6.0, _source("18100256"))
            ),
            _response(("18100004", 0.9, _source("18100004"))),
        ]
    )

    candidates = search_tables(client, "statcan-products", FakeEmbedder(), "inflation rate")

    assert {c.product_id for c in candidates} == {18100004, 18100256}


def test_year_in_query_text_is_extracted_as_a_filter():
    client = FakeOpenSearchClient(
        [
            _response(("14100287", 5.0, _source("14100287"))),
            _response(("14100287", 0.9, _source("14100287"))),
        ]
    )

    search_tables(client, "statcan-products", FakeEmbedder(), "unemployment rate in 2015")

    bm25_call = client.calls[0]
    assert {"range": {"coverage.start_date": {"lte": "2015-12-31"}}} in bm25_call["body"]["query"][
        "bool"
    ]["filter"]


def test_caller_filter_is_additive_not_overriding_query_text_extraction():
    client = FakeOpenSearchClient(
        [
            _response(("14100287", 5.0, _source("14100287"))),
            _response(("14100287", 0.9, _source("14100287"))),
        ]
    )

    # Query text already says "monthly" - a caller filter asking for "quarterly" must not
    # replace what the text already pinned down; it's simply not applied.
    search_tables(
        client,
        "statcan-products",
        FakeEmbedder(),
        "monthly employment data",
        filters=TableSearchFilters(frequency="quarterly"),
    )

    bm25_call = client.calls[0]
    assert {"term": {"frequency.code": "6"}} in bm25_call["body"]["query"]["bool"]["filter"]
    assert {"term": {"frequency.code": "9"}} not in bm25_call["body"]["query"]["bool"]["filter"]


def test_caller_filter_applies_when_query_text_has_no_frequency():
    client = FakeOpenSearchClient(
        [
            _response(("14100287", 5.0, _source("14100287"))),
            _response(("14100287", 0.9, _source("14100287"))),
        ]
    )

    search_tables(
        client,
        "statcan-products",
        FakeEmbedder(),
        "employment data",
        filters=TableSearchFilters(frequency="quarterly"),
    )

    bm25_call = client.calls[0]
    assert {"term": {"frequency.code": "9"}} in bm25_call["body"]["query"]["bool"]["filter"]


def test_table_candidate_is_active_derived_from_archived_field():
    client = FakeOpenSearchClient(
        [
            _response(("1", 1.0, _source("1", archived=True))),
            _response(("1", 0.5, _source("1", archived=True))),
        ]
    )

    [candidate] = search_tables(client, "statcan-products", FakeEmbedder(), "some table")

    assert candidate.is_active is False


def test_table_candidate_maps_subjects_and_date_range():
    client = FakeOpenSearchClient(
        [
            _response(("1", 1.0, _source("1"))),
            _response(("1", 0.5, _source("1"))),
        ]
    )

    [candidate] = search_tables(client, "statcan-products", FakeEmbedder(), "some table")

    assert candidate.subjects == ["Labour"]
    assert candidate.date_range.start == "1976-01-01"
    assert candidate.date_range.end == "2026-08-01"
