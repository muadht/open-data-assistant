"""The `search_tables` MCP tool.

Resolves a natural-language query to ranked candidate tables. Runs the query through the
existing regex-based extraction (`parse_query`) first; an exact productId/CANSIM-id match
short-circuits to an exact lookup rather than going through ranking. Otherwise, uses the
promoted hybrid search (`search/hybrid.py`, ticket #6) over the catalogue index.

See docs/mcp-tools-and-data-contract.md for the full contract.
"""

from __future__ import annotations

from ...search.embeddings import EmbeddingProvider
from ...search.hybrid import (
    SearchClient,
    SearchHit,
    bm25_search,
    hybrid_search,
    similar_search,
)
from ...search.query import _FREQUENCY_TERMS, build_filters, parse_query
from ..schemas import DateRange, TableCandidate, TableSearchFilters


def search_tables(
    client: SearchClient,
    index_name: str,
    embedder: EmbeddingProvider,
    query: str,
    filters: TableSearchFilters | None = None,
    *,
    k: int = 10,
) -> list[TableCandidate]:
    filters = filters or TableSearchFilters()
    parsed = parse_query(query)

    structured_filters = build_filters(parsed, include_archived=filters.include_archived)

    # The regex pass already turns an unambiguous frequency word in the query *text* into a
    # filter; a caller-supplied `filters.frequency` is additive, not a replacement - it only
    # applies when the query text itself didn't already pin one down.
    if filters.frequency is not None and parsed.frequency_code is None:
        structured_filters.append({"term": {"frequency.code": _FREQUENCY_TERMS[filters.frequency]}})
    if filters.subject is not None:
        structured_filters.append({"term": {"subjects.code": filters.subject}})

    if parsed.identifier:
        # An explicit table number is an exact lookup, not a ranking problem (see
        # `build_lexical_query`'s identifier branch) - skip fusion entirely.
        hits = bm25_search(client, index_name, parsed, k, structured_filters)
    else:
        hits = hybrid_search(client, index_name, embedder, parsed, k, structured_filters)

    return [to_candidate(hit) for hit in hits]


def similar_tables(
    client: SearchClient, index_name: str, product_id: int, *, k: int = 5
) -> list[TableCandidate]:
    """Active tables most similar to `product_id`, by catalogue embedding. Not one of the
    four MCP tools - used for an answer's related tables (#54) when the run had no search
    results of its own to draw from."""
    hits = similar_search(client, index_name, str(product_id), k, [{"term": {"archived": False}}])
    return [to_candidate(hit) for hit in hits]


def to_candidate(hit: SearchHit) -> TableCandidate:
    source = hit.source
    coverage = source.get("coverage") or {}
    return TableCandidate(
        product_id=int(source["product_id"]),
        title_en=source["title"]["en"],
        subjects=[s["en"] for s in source.get("subjects") or []],
        frequency=(source.get("frequency") or {}).get("en") or "Unknown",
        date_range=DateRange(
            start=coverage.get("start_date") or "",
            end=coverage.get("end_date") or "",
        ),
        is_active=not source.get("archived", False),
        last_released=(source.get("release_time") or "")[:10] or None,
        score=hit.score,
    )
