"""Browsing the catalogue index with filters (#56): the search behind the "Browse tables"
page. Text search reuses `hybrid_search`, ranked the same way the agent's `search_tables`
sees it ("newest first" reorders those same results); without text it's a plain filtered
listing, newest release first.

Filter counts come from one aggregation query. Each facet is counted with every *other*
filter applied but not its own, so switching between, say, Monthly and Annual shows how many
tables each would give rather than only the one already chosen.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

from .embeddings import EmbeddingProvider
from .hybrid import SearchClient, SearchHit, hits_from_response, hybrid_search
from .query import build_filters, build_lexical_query, parse_query

PAGE_SIZE = 20
# Hybrid ranking has no total count, so text search ranks this many and pages through them.
MAX_RANKED = 100

Sort = Literal["relevance", "updated"]


@dataclass(frozen=True)
class BrowseQuery:
    q: str = ""
    # A full subject path as StatCan names it, e.g. "Prices and price indexes/Consumer
    # price indexes" - the path itself encodes the hierarchy.
    subject: str | None = None
    frequency: str | None = None
    year_from: int | None = None
    year_to: int | None = None
    include_archived: bool = False
    sort: Sort = "relevance"
    page: int = 1


@dataclass(frozen=True)
class FacetValue:
    value: str
    count: int


@dataclass(frozen=True)
class Facets:
    # The next level of the subject hierarchy to drill into...
    subjects: list[FacetValue] = field(default_factory=list)
    # ...and every subject at any level, so the subject filter can be searched by name.
    all_subjects: list[FacetValue] = field(default_factory=list)
    frequencies: list[FacetValue] = field(default_factory=list)
    active: int = 0
    archived: int = 0


@dataclass(frozen=True)
class BrowseResult:
    hits: list[SearchHit]
    total: int
    facets: Facets


def browse(
    client: SearchClient, index: str, embedder: EmbeddingProvider, query: BrowseQuery
) -> BrowseResult:
    start = (query.page - 1) * PAGE_SIZE
    if query.q.strip():
        # Ranked text search: page through the ranked tables, and count filters over those
        # same tables so the counts always match what's listed. (Counting over a broader
        # keyword match instead gave counts for tables that never appear in the results.)
        parsed = parse_query(query.q)
        filters = _filters(query) + build_filters(parsed)
        ranked = hybrid_search(client, index, embedder, parsed, MAX_RANKED, filters)
        if query.sort == "updated":
            # The same relevant tables, newest release first - not every table that merely
            # shares a word with the query, which a sorted keyword match would give.
            ranked = sorted(ranked, key=lambda h: h.source.get("release_time") or "", reverse=True)
        return BrowseResult(
            hits=ranked[start : start + PAGE_SIZE],
            total=len(ranked),
            facets=_facets_of(ranked, query.subject),
        )
    hits, total = _listing(client, index, query, start)
    return BrowseResult(hits=hits, total=total, facets=_facets(client, index, query))


def _filters(query: BrowseQuery, *, without: str | None = None) -> list[dict[str, Any]]:
    filters: list[dict[str, Any]] = []
    if query.subject and without != "subject":
        filters.append({"term": {"subjects.en.raw": query.subject}})
    if query.frequency and without != "frequency":
        filters.append({"term": {"frequency.en": query.frequency}})
    # Coverage *overlap*, as in search/query.py: a 1978-2018 table matches "from 2015".
    if query.year_to is not None:
        filters.append({"range": {"coverage.start_date": {"lte": f"{query.year_to}-12-31"}}})
    if query.year_from is not None:
        filters.append({"range": {"coverage.end_date": {"gte": f"{query.year_from}-01-01"}}})
    if not query.include_archived and without != "archived":
        filters.append({"term": {"archived": False}})
    return filters


def _base_query(query: BrowseQuery) -> dict[str, Any]:
    if not query.q.strip():
        return {"match_all": {}}
    return build_lexical_query(parse_query(query.q))


def _listing(
    client: SearchClient, index: str, query: BrowseQuery, start: int
) -> tuple[list[SearchHit], int]:
    response = client.search(
        index=index,
        body={
            "query": {"bool": {"must": _base_query(query), "filter": _filters(query)}},
            "sort": [{"release_time": {"order": "desc", "missing": "_last"}}],
            "from": start,
            "size": PAGE_SIZE,
            "track_total_hits": True,
            "_source": {"excludes": ["embedding"]},
        },
    )
    return hits_from_response(response), int(response["hits"]["total"]["value"])


def _facets(client: SearchClient, index: str, query: BrowseQuery) -> Facets:
    def counted(facet: str, terms: dict[str, Any]) -> dict[str, Any]:
        return {
            "filter": {"bool": {"filter": _filters(query, without=facet)}},
            "aggs": {"values": {"terms": terms}},
        }

    response = client.search(
        index=index,
        body={
            "size": 0,
            "query": _base_query(query),
            "aggs": {
                "subjects": counted("subject", {"field": "subjects.en.raw", "size": 1000}),
                "frequencies": counted("frequency", {"field": "frequency.en", "size": 50}),
                "archived": counted("archived", {"field": "archived"}),
            },
        },
    )
    aggs = response["aggregations"]

    def buckets(name: str) -> list[dict[str, Any]]:
        return list(aggs[name]["values"]["buckets"])

    archived = {
        str(b.get("key_as_string", b["key"])).lower(): b["doc_count"] for b in buckets("archived")
    }
    return Facets(
        subjects=_subject_level(buckets("subjects"), query.subject),
        all_subjects=_by_count(buckets("subjects")),
        frequencies=[FacetValue(b["key"], b["doc_count"]) for b in buckets("frequencies")],
        active=archived.get("false", 0),
        archived=archived.get("true", 0),
    )


def _facets_of(hits: list[SearchHit], selected_subject: str | None) -> Facets:
    subjects: dict[str, int] = {}
    frequencies: dict[str, int] = {}
    archived = 0
    for hit in hits:
        for subject in hit.source.get("subjects") or []:
            subjects[subject["en"]] = subjects.get(subject["en"], 0) + 1
        frequency = (hit.source.get("frequency") or {}).get("en")
        if frequency:
            frequencies[frequency] = frequencies.get(frequency, 0) + 1
        archived += bool(hit.source.get("archived"))
    subject_buckets = [{"key": k, "doc_count": n} for k, n in subjects.items()]
    return Facets(
        subjects=_subject_level(subject_buckets, selected_subject),
        all_subjects=_by_count(subject_buckets),
        frequencies=sorted(
            (FacetValue(k, n) for k, n in frequencies.items()), key=lambda v: (-v.count, v.value)
        ),
        active=len(hits) - archived,
        archived=archived,
    )


def _subject_level(buckets: list[dict[str, Any]], selected: str | None) -> list[FacetValue]:
    """The level of the subject hierarchy to offer next: top-level subjects, or the direct
    children of the selected one (one more "/"-separated segment)."""
    depth = 0 if selected is None else selected.count("/") + 1
    values = [
        FacetValue(b["key"], b["doc_count"])
        for b in buckets
        if b["key"].count("/") == depth
        and (selected is None or b["key"].startswith(selected + "/"))
    ]
    return sorted(values, key=lambda v: (-v.count, v.value))


def _by_count(buckets: list[dict[str, Any]]) -> list[FacetValue]:
    values = [FacetValue(b["key"], b["doc_count"]) for b in buckets]
    return sorted(values, key=lambda v: (-v.count, v.value))
