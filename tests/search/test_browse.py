"""Tests for catalogue browsing (#56) - a fake OpenSearch client records each request body,
so these check the queries sent as well as how responses become results and counts."""

from __future__ import annotations

from typing import Any

from open_data_assistant.search.browse import PAGE_SIZE, BrowseQuery, browse
from tests.mcp.tools.test_search_tables import FakeEmbedder, FakeOpenSearchClient, _response

PRICES = "Prices and price indexes"
CPI = f"{PRICES}/Consumer price indexes"


def _source(product_id: str, *, subjects: list[str], frequency: str = "Monthly") -> dict[str, Any]:
    return {
        "product_id": product_id,
        "title": {"en": f"Table {product_id}"},
        "subjects": [{"code": "18", "en": s} for s in subjects],
        "frequency": {"code": "6", "en": frequency},
        "coverage": {"start_date": "1992-01-01", "end_date": "2026-08-01"},
        "archived": False,
        "release_time": "2026-09-14T12:30:00Z",
    }


def _listing(total: int, *hits: tuple[str, dict[str, Any]]) -> dict[str, Any]:
    # Sorted by release time, so OpenSearch gives no relevance score: `_score` is null, as in
    # the real response (caught live - a non-null fake score hid it).
    response = _response(*((doc_id, None, source) for doc_id, source in hits))  # type: ignore[arg-type]
    response["hits"]["total"] = {"value": total, "relation": "eq"}
    return response


def _aggregations(subjects: dict[str, int], frequencies: dict[str, int]) -> dict[str, Any]:
    def values(counts: dict[str, Any]) -> dict[str, Any]:
        return {"values": {"buckets": [{"key": k, "doc_count": n} for k, n in counts.items()]}}

    return {
        "hits": {"hits": []},
        "aggregations": {
            "subjects": values(subjects),
            "frequencies": values(frequencies),
            "archived": {
                "values": {
                    "buckets": [
                        {"key": 0, "key_as_string": "false", "doc_count": 40},
                        {"key": 1, "key_as_string": "true", "doc_count": 7},
                    ]
                }
            },
        },
    }


def test_listing_without_text_is_newest_first_with_filters_applied() -> None:
    client = FakeOpenSearchClient(
        [
            _listing(43, ("18100004", _source("18100004", subjects=[PRICES, CPI]))),
            _aggregations({PRICES: 43, CPI: 12, f"{PRICES}/Producer price indexes": 20}, {}),
        ]
    )
    query = BrowseQuery(subject=PRICES, frequency="Monthly", year_from=2020, page=2)

    result = browse(client, "statcan-products", FakeEmbedder(), query)

    assert result.total == 43
    assert [h.doc_id for h in result.hits] == ["18100004"]
    listing = client.calls[0]["body"]
    assert listing["sort"] == [{"release_time": {"order": "desc", "missing": "_last"}}]
    assert listing["from"] == PAGE_SIZE and listing["size"] == PAGE_SIZE
    assert listing["query"]["bool"]["must"] == {"match_all": {}}
    assert listing["query"]["bool"]["filter"] == [
        {"term": {"subjects.en.raw": PRICES}},
        {"term": {"frequency.en": "Monthly"}},
        {"range": {"coverage.end_date": {"gte": "2020-01-01"}}},
        {"term": {"archived": False}},
    ]


def test_each_count_leaves_out_its_own_filter() -> None:
    """So the counts show what each choice *would* give, not just the current one."""
    client = FakeOpenSearchClient([_listing(0), _aggregations({}, {})])
    browse(
        client,
        "statcan-products",
        FakeEmbedder(),
        BrowseQuery(subject=PRICES, frequency="Monthly"),
    )

    aggs = client.calls[1]["body"]["aggs"]
    subject_filters = aggs["subjects"]["filter"]["bool"]["filter"]
    frequency_filters = aggs["frequencies"]["filter"]["bool"]["filter"]
    assert {"term": {"subjects.en.raw": PRICES}} not in subject_filters
    assert {"term": {"frequency.en": "Monthly"}} in subject_filters
    assert {"term": {"frequency.en": "Monthly"}} not in frequency_filters
    assert {"term": {"subjects.en.raw": PRICES}} in frequency_filters


def test_subject_counts_offer_the_next_level_of_the_hierarchy() -> None:
    counts = {PRICES: 43, CPI: 12, f"{PRICES}/Producer price indexes": 20, "Labour": 9}
    top = browse(
        FakeOpenSearchClient([_listing(0), _aggregations(counts, {"Monthly": 43})]),
        "statcan-products",
        FakeEmbedder(),
        BrowseQuery(),
    )
    within_prices = browse(
        FakeOpenSearchClient([_listing(0), _aggregations(counts, {})]),
        "statcan-products",
        FakeEmbedder(),
        BrowseQuery(subject=PRICES),
    )

    assert [(f.value, f.count) for f in top.facets.subjects] == [(PRICES, 43), ("Labour", 9)]
    assert [f.value for f in within_prices.facets.subjects] == [
        f"{PRICES}/Producer price indexes",
        CPI,
    ]
    # Every subject at any level is also returned, for searching subjects by name.
    assert [f.value for f in top.facets.all_subjects] == [
        PRICES,
        f"{PRICES}/Producer price indexes",
        CPI,
        "Labour",
    ]
    assert top.facets.frequencies[0].value == "Monthly"
    assert (top.facets.active, top.facets.archived) == (40, 7)


def test_text_search_is_ranked_and_counted_over_its_own_results() -> None:
    cpi = _source("18100004", subjects=[PRICES, CPI])
    annual = _source("18100005", subjects=[PRICES, CPI], frequency="Annual")
    # Hybrid search: one BM25 and one kNN response, no aggregation query.
    client = FakeOpenSearchClient(
        [
            _response(("18100004", 9.0, cpi), ("18100005", 8.0, annual)),
            _response(("18100004", 0.9, cpi)),
        ]
    )

    result = browse(
        client, "statcan-products", FakeEmbedder(), BrowseQuery(q="consumer price index")
    )

    assert [h.doc_id for h in result.hits] == ["18100004", "18100005"]
    assert result.total == 2
    assert len(client.calls) == 2
    assert [(f.value, f.count) for f in result.facets.subjects] == [(PRICES, 2)]
    assert {f.value: f.count for f in result.facets.frequencies} == {"Monthly": 1, "Annual": 1}


def test_text_search_newest_first_reorders_the_relevant_tables() -> None:
    older = {**_source("18100004", subjects=[PRICES]), "release_time": "2026-08-01T12:30:00Z"}
    newer = {**_source("18100006", subjects=[PRICES]), "release_time": "2026-09-14T12:30:00Z"}
    client = FakeOpenSearchClient(
        [_response(("18100004", 9.0, older), ("18100006", 8.0, newer)), _response()]
    )

    result = browse(
        client,
        "statcan-products",
        FakeEmbedder(),
        BrowseQuery(q="consumer price index", sort="updated"),
    )

    assert [h.doc_id for h in result.hits] == ["18100006", "18100004"]
    assert result.total == 2
