"""The `search_tables` MCP tool.

Resolves a natural-language query to ranked candidate tables. Runs the query through the
existing regex-based extraction (`parse_query`) first; an exact productId/CANSIM-id match
short-circuits to an exact lookup rather than going through ranking. Otherwise, uses the
promoted hybrid search (`search/hybrid.py`, ticket #6) over the catalogue index.

See docs/mcp-tools-and-data-contract.md for the full contract.
"""

from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeoutError

import httpx

from ...search.embeddings import EmbeddingProvider
from ...search.hybrid import (
    SearchClient,
    SearchHit,
    bm25_search,
    hybrid_search,
    similar_search,
)
from ...search.query import _FREQUENCY_TERMS, build_filters, parse_query
from ...wds.client import WdsClient, WdsError
from ..schemas import DateRange, TableCandidate, TableSearchFilters, TableSearchResult
from .get_table_structure import get_table_structure

logger = logging.getLogger(__name__)

# How long search waits for the top candidate's structure. WDS usually describes a table in
# 0.1-0.3 s, but a cold getCubeMetadata sometimes takes 10 s or more (36100104: 12.3 s live,
# 2026-10-10). Past this, search returns without the structure; the fetch carries on in the
# background and fills the metadata cache for get_table_structure or get_data.
STRUCTURE_WAIT_SECONDS = 2.0
_structure_fetches = ThreadPoolExecutor(max_workers=2, thread_name_prefix="table-structure")


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


def search_tables_with_structure(
    client: SearchClient,
    index_name: str,
    embedder: EmbeddingProvider,
    wds_client: WdsClient,
    query: str,
    filters: TableSearchFilters | None = None,
    *,
    k: int = 10,
    structure_wait_seconds: float = STRUCTURE_WAIT_SECONDS,
) -> TableSearchResult:
    """`search_tables`, plus the top candidate's structure (#90). In measured runs the model
    spent a whole turn (1.5-2.5 s) calling get_table_structure on the table it had just found
    before it could fetch data; the top candidate is usually the one it picks. The structure
    costs one cached getCubeMetadata. Search still works when WDS doesn't, or is slow: then
    the structure is left out."""
    candidates = search_tables(client, index_name, embedder, query, filters, k=k)
    if not candidates:
        return TableSearchResult(candidates=candidates)
    product_id = candidates[0].product_id
    fetch = _structure_fetches.submit(get_table_structure, wds_client, product_id)
    try:
        top_structure = fetch.result(timeout=structure_wait_seconds)
    except FutureTimeoutError:
        logger.info("Structure for %s still loading; searching without it", product_id)
        top_structure = None
    except (WdsError, httpx.HTTPError, ValueError) as exc:
        logger.warning("No structure for top candidate %s: %s", product_id, exc)
        top_structure = None
    return TableSearchResult(candidates=candidates, top_structure=top_structure)


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
