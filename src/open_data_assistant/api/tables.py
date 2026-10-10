"""Read-only catalogue endpoints for the "Browse tables" page (#56).

`GET /tables/search` filters and ranks the catalogue index (search/browse.py), `GET
/tables/{id}` returns a table's details, and `GET /tables/{id}/related` similar tables. The
endpoints are plain `def`s: the OpenSearch client, embedder and WDS client are synchronous,
so FastAPI runs them in its threadpool.
"""

from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field

from ..agent.deps import AgentDeps
from ..mcp.schemas import TableCandidate, TableStructure
from ..mcp.tools.get_table_structure import get_table_structure
from ..mcp.tools.search_tables import similar_tables, to_candidate
from ..search.browse import PAGE_SIZE, BrowseQuery, Facets, browse
from ..search.hybrid import hits_from_response
from ..wds.client import WdsError, WdsMaintenanceWindow

router = APIRouter(prefix="/tables", tags=["tables"])


class FacetValue(BaseModel):
    value: str = Field(description="A subject path (e.g. 'Prices and price indexes') or frequency.")
    count: int


class FacetCounts(BaseModel):
    subjects: list[FacetValue] = Field(
        description=(
            "The next level of subjects to filter by: top-level subjects, or the children of "
            "the selected subject."
        )
    )
    all_subjects: list[FacetValue] = Field(
        description="Every subject at any level, with counts - for searching subjects by name."
    )
    frequencies: list[FacetValue]
    active: int
    archived: int


class TableSearchResponse(BaseModel):
    total: int = Field(description="Matching tables; text search ranks at most 100.")
    page: int
    page_size: int
    results: list[TableCandidate]
    facets: FacetCounts


class TableDetails(BaseModel):
    table: TableCandidate
    subjects: list[str] = Field(description="Every subject path the table is filed under.")
    structure: TableStructure
    source_url: str


def _deps(request: Request) -> AgentDeps:
    deps: AgentDeps = request.app.state.deps
    return deps


@router.get("/search")
def search_tables(
    request: Request,
    q: str = "",
    subject: str | None = None,
    frequency: str | None = None,
    year_from: Annotated[int | None, Query(alias="from", ge=1800, le=2200)] = None,
    year_to: Annotated[int | None, Query(alias="to", ge=1800, le=2200)] = None,
    include_archived: bool = False,
    sort: Literal["relevance", "updated"] = "relevance",
    page: Annotated[int, Query(ge=1, le=500)] = 1,
) -> TableSearchResponse:
    deps = _deps(request)
    query = BrowseQuery(
        q=q,
        subject=subject or None,
        frequency=frequency or None,
        year_from=year_from,
        year_to=year_to,
        include_archived=include_archived,
        sort=sort,
        page=page,
    )
    result = browse(deps.search_client, deps.search_index, deps.embedder, query)
    return TableSearchResponse(
        total=result.total,
        page=page,
        page_size=PAGE_SIZE,
        results=[to_candidate(hit) for hit in result.hits],
        facets=_facet_counts(result.facets),
    )


@router.get("/{product_id}")
def table_details(request: Request, product_id: int) -> TableDetails:
    deps = _deps(request)
    response = deps.search_client.search(
        index=deps.search_index,
        body={
            "size": 1,
            "query": {"ids": {"values": [str(product_id)]}},
            "_source": {"excludes": ["embedding"]},
        },
    )
    hits = hits_from_response(response)
    if not hits:
        raise HTTPException(404, f"No table {product_id} in the catalogue.")
    hit = hits[0]
    try:
        structure = get_table_structure(deps.wds_client, product_id)
    except WdsMaintenanceWindow as exc:
        raise HTTPException(
            503,
            "Statistics Canada's data service is updating (midnight to 8:30 AM ET). "
            "Try again shortly.",
        ) from exc
    except (WdsError, ValueError) as exc:
        raise HTTPException(502, "Couldn't load this table's structure from StatCan.") from exc
    return TableDetails(
        table=to_candidate(hit),
        subjects=[s["en"] for s in hit.source.get("subjects") or []],
        structure=structure,
        source_url=f"https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid={product_id}01",
    )


@router.get("/{product_id}/related")
def related_tables(request: Request, product_id: int) -> list[TableCandidate]:
    deps = _deps(request)
    return similar_tables(deps.search_client, deps.search_index, product_id, k=5)


def _facet_counts(facets: Facets) -> FacetCounts:
    return FacetCounts(
        subjects=[FacetValue(value=f.value, count=f.count) for f in facets.subjects],
        all_subjects=[FacetValue(value=f.value, count=f.count) for f in facets.all_subjects],
        frequencies=[FacetValue(value=f.value, count=f.count) for f in facets.frequencies],
        active=facets.active,
        archived=facets.archived,
    )
