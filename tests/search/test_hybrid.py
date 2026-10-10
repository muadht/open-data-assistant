"""Tests for the promoted hybrid search (ticket #6).

No live OpenSearch - the client and embedder are both fakes, since this is unit coverage of
the query-building and RRF fusion logic, not an integration test of a real cluster.
"""

from __future__ import annotations

from typing import Any

from open_data_assistant.search.hybrid import SearchHit, bm25_search, hybrid_search, knn_search
from open_data_assistant.search.query import parse_query


class FakeOpenSearchClient:
    """Records the search bodies it receives and returns canned responses in call order."""

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


def _response(*hits: tuple[str, float]) -> dict[str, Any]:
    return {
        "hits": {
            "hits": [
                {"_id": doc_id, "_score": score, "_source": {"title": {"en": doc_id}}}
                for doc_id, score in hits
            ]
        }
    }


def test_bm25_search_sends_lexical_query_and_filters_and_parses_hits():
    client = FakeOpenSearchClient([_response(("14100287", 5.0))])
    parsed = parse_query("unemployment rate")
    filters = [{"term": {"archived": False}}]

    hits = bm25_search(client, "statcan-products", parsed, k=10, filters=filters)

    assert hits == [SearchHit(doc_id="14100287", score=5.0, source={"title": {"en": "14100287"}})]
    [call] = client.calls
    assert call["body"]["query"]["bool"]["filter"] == filters
    assert call["body"]["size"] == 10


def test_knn_search_embeds_the_query_text_and_sends_a_knn_query():
    client = FakeOpenSearchClient([_response(("18100004", 0.9))])
    parsed = parse_query("consumer price index")

    hits = knn_search(client, "statcan-products", FakeEmbedder(), parsed, k=5, filters=[])

    assert [h.doc_id for h in hits] == ["18100004"]
    [call] = client.calls
    assert call["body"]["query"]["knn"]["embedding"]["vector"] == [0.1, 0.2, 0.3]
    assert call["body"]["query"]["knn"]["embedding"]["k"] == 5


def test_hybrid_search_fuses_bm25_and_knn_results_via_rrf():
    # BM25 ranks A first, B second. kNN ranks B first, C second. RRF should rank B on top
    # since it's the only doc both lists agree on, even though neither ranked it #1 alone.
    client = FakeOpenSearchClient(
        [
            _response(("A", 10.0), ("B", 8.0)),
            _response(("B", 0.95), ("C", 0.80)),
        ]
    )
    parsed = parse_query("gdp")

    hits = hybrid_search(client, "statcan-products", FakeEmbedder(), parsed, k=3, filters=[])

    assert [h.doc_id for h in hits] == ["B", "A", "C"]


def test_hybrid_search_respects_k_after_fusion():
    client = FakeOpenSearchClient(
        [
            _response(("A", 10.0), ("B", 8.0), ("C", 6.0)),
            _response(("D", 0.95), ("E", 0.80), ("F", 0.70)),
        ]
    )
    parsed = parse_query("gdp")

    hits = hybrid_search(client, "statcan-products", FakeEmbedder(), parsed, k=2, filters=[])

    assert len(hits) == 2
