"""Hybrid (BM25 + kNN) search over the StatCan product catalogue index.

Promoted out of `DataDiscovery/tools/search_app.py` - a disposable Streamlit tool for manual
testing - into a reusable library function, per ticket #6. Same reciprocal-rank-fusion approach
that tool used, now callable from `search_tables` (ticket #7) without a Streamlit dependency.
No change to ranking behavior - this is a refactor/promotion, not a ranking-quality change.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol

from .embeddings import EmbeddingProvider
from .query import ParsedQuery, build_lexical_query

# Reciprocal rank fusion constant - unranked items are penalized relative to this; 60 is RRF's
# conventional default and was not tuned further for this catalogue.
_RRF_K = 60


class SearchClient(Protocol):
    """The one OpenSearch method this module actually calls. A protocol rather than the
    concrete `OpenSearch` class so tests can pass a plain fake instead of standing up (or
    mocking the internals of) a real client."""

    def search(self, *, index: str, body: dict[str, Any]) -> dict[str, Any]: ...


@dataclass(frozen=True)
class SearchHit:
    doc_id: str
    score: float
    source: dict[str, Any]


def _hits(response: dict[str, Any]) -> list[SearchHit]:
    return [
        SearchHit(doc_id=h["_id"], score=h["_score"], source=h["_source"])
        for h in response["hits"]["hits"]
    ]


def bm25_search(
    client: SearchClient,
    index_name: str,
    parsed: ParsedQuery,
    k: int,
    filters: list[dict[str, Any]],
) -> list[SearchHit]:
    query = {"bool": {"must": build_lexical_query(parsed), "filter": filters}}
    response = client.search(index=index_name, body={"size": k, "query": query})
    return _hits(response)


def knn_search(
    client: SearchClient,
    index_name: str,
    embedder: EmbeddingProvider,
    parsed: ParsedQuery,
    k: int,
    filters: list[dict[str, Any]],
) -> list[SearchHit]:
    vector = embedder.embed([parsed.text or ""])[0]
    knn: dict[str, Any] = {"vector": vector, "k": k}
    if filters:
        knn["filter"] = {"bool": {"filter": filters}}
    response = client.search(
        index=index_name, body={"size": k, "query": {"knn": {"embedding": knn}}}
    )
    return _hits(response)


def hybrid_search(
    client: SearchClient,
    index_name: str,
    embedder: EmbeddingProvider,
    parsed: ParsedQuery,
    k: int,
    filters: list[dict[str, Any]],
) -> list[SearchHit]:
    """Reciprocal rank fusion over separate BM25 and kNN result lists - no OpenSearch
    search-pipeline setup required."""
    rrf_scores: dict[str, float] = {}
    sources: dict[str, dict[str, Any]] = {}
    for hits in (
        bm25_search(client, index_name, parsed, k * 2, filters),
        knn_search(client, index_name, embedder, parsed, k * 2, filters),
    ):
        for rank, hit in enumerate(hits):
            rrf_scores[hit.doc_id] = rrf_scores.get(hit.doc_id, 0.0) + 1.0 / (_RRF_K + rank)
            sources[hit.doc_id] = hit.source

    ranked = sorted(rrf_scores.items(), key=lambda item: item[1], reverse=True)[:k]
    return [
        SearchHit(doc_id=doc_id, score=score, source=sources[doc_id]) for doc_id, score in ranked
    ]


def similar_search(
    client: SearchClient,
    index_name: str,
    doc_id: str,
    k: int,
    filters: list[dict[str, Any]],
) -> list[SearchHit]:
    """Nearest neighbours of an already-indexed document, by the embedding stored with it -
    "tables like this one", with no query text to embed. Excludes the document itself."""
    response = client.search(
        index=index_name,
        body={"size": 1, "query": {"ids": {"values": [doc_id]}}, "_source": ["embedding"]},
    )
    hits = response["hits"]["hits"]
    if not hits or "embedding" not in hits[0]["_source"]:
        return []

    knn: dict[str, Any] = {"vector": hits[0]["_source"]["embedding"], "k": k + 1}
    if filters:
        knn["filter"] = {"bool": {"filter": filters}}
    response = client.search(
        index=index_name,
        body={
            "size": k + 1,
            "query": {"knn": {"embedding": knn}},
            "_source": {"excludes": ["embedding"]},
        },
    )
    return [hit for hit in _hits(response) if hit.doc_id != doc_id][:k]
