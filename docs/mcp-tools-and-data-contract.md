# MCP Tools & Data Contract

This document defines the MCP server's tool surface and the data shapes that flow between it, the orchestration service, and the frontend. It is the contract AI coding assistants and human contributors should implement against — not an implementation guide.

## Why an MCP server, and why these tools

WDS has no search endpoint: it can only fetch data once the exact table (productId) and series (coordinate or vector) are known. The LLM is good at understanding what a user is asking for, but it must never be the thing that builds a StatCan coordinate — that's a mechanical, validatable operation and belongs in code. The MCP server's job is to turn "what the user means" into "what WDS needs," and to do it the same way every time.

This leads to a small, ordered tool set: search for a table, inspect its structure, resolve member phrases to IDs, then fetch data. Each tool's output is the next tool's input, so the LLM chains them rather than guessing IDs itself.

## Tools

### `search_tables(query, filters?) -> TableCandidate[]`

Searches the catalogue index (built by this repo's `catalogue/` and `search/` packages — see Index design below) for tables matching a natural-language query. Ranking is hybrid: BM25 lexical + embedding (kNN) similarity, fused with reciprocal rank fusion (RRF).

Before ranking, the query string goes through a deliberately crude regex extraction pass (`open_data_assistant.search.query.parse_query`): an 8-digit productId or a `###-####` CANSIM id is pulled out as an **exact-match** short-circuit (skips ranking entirely), a 4-digit year or year range becomes a `coverage` overlap filter, and an unambiguous frequency word (daily/weekly/monthly/quarterly/annual) becomes a `frequency` filter. Whatever remains of the query text is what actually hits BM25 and the embedding model — this exists because leaving years in the lexical text was observed to cause false matches (e.g. "2010" in a query matching a table titled "...applied for patents in 2010"). `search_tables`'s `filters` parameter is applied **in addition to** this auto-extraction, not instead of it — the MCP tool should not re-implement year/frequency parsing.

- `query`: natural-language string (e.g. "unemployment rate by province").
- `filters` (optional): subject, frequency, archived/active — merged with whatever the regex pass already extracted.
- Returns a ranked list of `TableCandidate`, each with enough detail for the LLM to pick one or ask the user to disambiguate — not the full table structure (that's `get_table_structure`).

Implemented in `open_data_assistant.mcp.tools.search_tables`, backed by the promoted hybrid search in `open_data_assistant.search.hybrid` (tickets #6/#7 — no longer a gap).

```json
TableCandidate {
  "product_id": 14100287,
  "title_en": "Labour force characteristics by province, monthly, seasonally adjusted",
  "subjects": ["Labour"],
  "frequency": "Monthly",
  "date_range": { "start": "1976-01-01", "end": "2025-09-01" },
  "is_active": true,
  "score": 0.91
}
```

### `get_table_structure(productId) -> TableStructure`

Wraps `getCubeMetadata` (and `getCodeSets` where needed). Returns the table's dimensions and their top-level members and frequency — everything needed to know what can be asked of this table before resolving specific member phrases.

Note: `default_scalar_factor` is a best-effort placeholder (`"units"`), not a reliable value — WDS only exposes scalar factor **per-series** (via `getSeriesInfoFromCubePidCoord`), not per-table. `get_cube_metadata`'s response has no table-level scalar factor field at all. `get_data` applies the real, per-series scalar factor when it actually fetches data; nothing should rely on this field to predict or double-check that.

```json
TableStructure {
  "product_id": 14100287,
  "title_en": "...",
  "dimensions": [
    { "dimension_position_id": 1, "name_en": "Geography", "has_uom": false },
    { "dimension_position_id": 2, "name_en": "Labour force characteristics", "has_uom": false }
  ],
  "default_scalar_factor": "units",
  "frequency": "Monthly",
  "is_census_table": false
}
```

`is_census_table` is derived from the productId prefix (`9810...`) and flags that this table has no vector IDs — only coordinate-based fetches apply.

### `find_members(productId, dimensionPositionId, query) -> MemberCandidate[]`

Resolves a phrase like "Ontario" or "25 to 34 years" to member IDs within one dimension of one table. This is a narrow, per-dimension search — not a general search — because member meaning is table-specific (e.g. "Ontario" as a geography member vs. as a named survey category).

```json
MemberCandidate {
  "member_id": 35,
  "name_en": "Ontario",
  "parent_member_id": null,
  "terminated": false
}
```

### `get_data(productId, selections, period) -> DataResult`

The only tool that fetches actual data. Takes resolved member selections (one member ID per dimension, or a default), builds the 10-part coordinate internally, decides whether to route through vector ID or coordinate based fetch, and returns the standard data shape below. The LLM never sees or constructs a coordinate string.

- `selections`: `{ dimensionPositionId: memberId }` for every dimension of the table (the server fills in defaults for unspecified dimensions where the table defines one).
- `period`: either `{ type: "latestN", n: <int> }` or `{ type: "range", start, end }`. Range queries are only possible via vector ID — if the resolved series has no vector ID (e.g. a census table), the server rejects a range request with a clear error rather than silently returning the wrong thing.

Internally, `get_data`:
1. Builds the coordinate from `selections`.
2. Looks up the vector ID via `getSeriesInfoFromCubePidCoord` if available.
3. Calls the appropriate WDS endpoint (`getDataFromVectorsAndLatestNPeriods`, `getDataFromVectorByReferencePeriodRange`, or `getDataFromCubePidCoordAndLatestNPeriods`).
4. Applies the scalar factor to every value (WDS decimals are pre-applied; the ×10^scalar is not).
5. Checks per-item SUCCESS/FAILED status and `vectorId: 0` (a formally "successful" but nonexistent series) and surfaces that as a clear "no data for this combination" rather than an empty chart.

## Standard data shape

One shape, shared by chat answers, charts, and exports — all three are rendered from the same object, not re-derived independently.

```json
DataResult {
  "product_id": 14100287,
  "title_en": "Labour force characteristics, monthly, seasonally adjusted and trend-cycle",
  "coordinate": "7.7.1.1.1.1.0.0.0.0",
  "vector_id": 2063949,
  "series": [
    {
      "ref_per": "2026-08-01",
      "value": 6.9,
      "uom": "Percent",
      "scalar_factor_applied": true,
      "status": "normal",
      "symbol": null,
      "security_level": "public"
    }
  ],
  "source_url": "https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=1410028701",
  "series_url": "https://www150.statcan.gc.ca/t1/tbl1/en/sbv.action?vectorNumbers=v2063949&searchOption=2&latestN=1",
  "retrieved_at": "2026-10-08T12:00:00Z"
}
```

This example is the real, live-verified Ontario unemployment series (question-catalogue-eval.xlsx row 1) — `title_en` is the table's `cubeTitleEn` (from `getCubeMetadata`), not the series-level title; `security_level` is `getCodeSets`'s real `securityLevelDescEn` for code 0 (`"public"`, not `"Unclassified"` — an earlier, unverified draft of this doc had that wrong).

- `series` is always an array, even for a single-point "latest value" answer — keeps charts, exports, and multi-period answers on one code path.
- A suppressed value appears as a `series` entry with `value: null` and `status` explaining why, rather than being dropped — the frontend and chat layer decide how to render a gap, but they always know it's there.
- `sourceUrl` and `retrievedAt` are mandatory on every result; this is what backs the citation and reference-period requirements in the [MVP scope](mvp-scope.md).
- `series_url` is the series-level (vector) citation link, and is `null` whenever `vector_id` is (e.g. Census tables). For a `latestN` query it carries the same `latestN`, so the linked page shows the same periods as the answer; no date-range parameter for `sbv.action` has been verified, so for a `range` query it omits `latestN` and the page shows only the latest period (both behaviours live-verified 2026-10-09).

## Index design and refresh

This section describes what `src/open_data_assistant/catalogue/` and `search/` actually do today, not an aspiration. This code was migrated from the original DataDiscovery repo (tickets #6/#7) into this one so the project no longer depends on that repo at runtime; the behavior below is unchanged from what was verified there.

- **Build is two-stage**: `build_catalogue()` calls `getAllCubesList` + `getCodeSets` for a coarse record per product (title, dates, frequency, top-level 2-digit subject code, dimension names only — no members). `enrich_from_cube_metadata()` then calls `getCubeMetadata` in chunks of 50 productIds (45s timeout per chunk; a chunk that times out is skipped and keeps its coarse data) to replace that with the fine-grained subject hierarchy (full ancestor chain, since subject codes are a 2/4/6-digit prefix hierarchy) and dimension **members**.
- **Only near-root members are indexed** (hierarchy depth ≤ 1: the root and its direct children), not every leaf. This is deliberate — some dimensions (fine census geography, detailed classifications) have tens of thousands of leaf members, which would be noise for search/embeddings. Consequence for this contract: the catalogue index is sufficient for `search_tables`, but **not** for resolving a specific member phrase — that's exactly why `find_members` queries live rather than reading the index (see below).
- **Indexed fields** (OpenSearch mapping in `search/schema.py`): bilingual `title.{en,fr}`, `subjects`/`surveys` (code + en/fr text), `dimensions` (nested: name + near-root values, en/fr), `coverage.{start_date,end_date}`, `frequency`, `archived`, `cansim_id`, plus a `knn_vector` `embedding` field and a plain-text `search_text` field.
- **Mapping is bilingual-ready; embeddings are not**: `search_text` (what gets embedded) is built from English fields only (`build_search_text` in `search/documents.py`). FR fields are indexed and could support FR lexical search, but there's no FR embedding model wired in yet — consistent with English-only being the MVP decision, but worth knowing the schema isn't blocking French later.
- **Ranking today**: BM25 (`multi_match` on `title.en^3` + `search_text`) and kNN cosine similarity over the embedding, fused via RRF (`1/(60+rank)` per list) — implemented as an importable function in `search/hybrid.py`, called directly by `search_tables`. There is **no boost for active or recently-updated tables** in the current code — only a binary `archived` include/exclude filter. Boosting recency/active status is a design intent from the original brief, not something built yet.
- **Embedding model**: `sentence-transformers/all-MiniLM-L6-v2`, run locally via `SentenceTransformerEmbedder`. Forced to CPU deliberately — Apple MPS was observed to crash this model under concurrent callers (e.g. Streamlit), which matters if the MCP server embeds queries on the same machine.
- **Refresh**: **not implemented.** `getChangedCubeList` (daily incremental refresh) is listed in `WDS_API_FLOW.md` as docs-only / never tested against the live API. Today, refreshing the catalogue means rerunning `build-catalogue` (a full `getAllCubesList` + chunked `getCubeMetadata` pass) from scratch. Treat incremental refresh as an open design item, not a given.
- **Current data**: a real, built `data/catalogue.json` (72MB) exists from the original DataDiscovery repo (built 2025-09-19) — proof there's a real catalogue to evaluate search quality against, not just a plan. It hasn't been copied into this repo (data files aren't committed - see `.gitignore`); rerun `uv run build-catalogue` here to produce a fresh one when needed.
- **Member resolution** (`find_members`) is not part of the catalogue index at all — it queries `getCubeMetadata`/`getCodeSets` per table at request time (cached by `WdsClient`), both because member meaning is table-specific and because the index deliberately excludes leaf-level members (see above).

## WDS quirks the server must handle

These are implementation requirements for the MCP server, not suggestions:

- **Per-item status inside HTTP 200**: every response is a list; each item carries its own SUCCESS/FAILED. A 200 does not mean the data is good — check every item.
- **Phantom series**: a non-existent coordinate returns SUCCESS with `vectorId: 0` and empty fields (title included). Treat this as "no such series," not as valid data. A real series — including a real Census series, which also has `vectorId: 0` — always has a title; that's the actual discriminator, not the vector ID.
- **Malformed coordinate is a hard error, not SUCCESS/FAILED**: a coordinate that isn't padded to exactly 10 dot-separated slots gets HTTP 406 (`"One or more co-ordinate(s) provided is not valid"`). `get_data` must always pad before calling WDS.
- **Vector `0` and non-positive `latestN` are rejected outright**: calling a vector-based method with `vectorId: 0` or `latestN <= 0` returns HTTP 406 (`"vector id or latest N is negative or zero"`). `get_data` must never forward a `vectorId: 0` it got back from a lookup into a data-fetch call.
- **Census tables have no vectors**: productIds starting `9810` can only be fetched by coordinate. `get_data` must detect this (via `get_table_structure`'s `isCensusTable`) and refuse range queries against them with a clear error instead of attempting a vector lookup.
- **Range queries require a vector ID**: no WDS method takes a coordinate *and* a date range. For a date range, the server must resolve the coordinate to a vector ID first, then call `getDataFromVectorByReferencePeriodRange`. If a user's question implies a date range on a table without a vector ID, say so rather than approximating.
- **An empty-but-valid range is not an error**: a date range with no matching data returns SUCCESS with an empty `vectorDataPoint` list — this is different from a WDS failure and should render as "no data for this period," not an error.
- **Scalar factor is not pre-applied**: decimals are; the ×10^scalar is not. `get_data` must apply it and record `scalarFactorApplied: true` so nothing downstream double-applies it.
- **Quality flags on every point**: status, symbol, and security flags must be read and passed through, not discarded after a successful fetch. Suppressed values come back empty — represent them explicitly (see standard data shape above), don't silently omit the period.
- **Metadata caching**: `WdsClient` caches `getCodeSets` for its lifetime (static lookup tables) and `getCubeMetadata` per product for an hour (it only changes on releases at 8:30 AM ET); failed items aren't cached. This roughly halves WDS calls per question, since `get_table_structure`, `find_members` and `get_data` all read the same metadata. The cache is per process, so it isn't shared between instances. `getChangedCubeList` could later invalidate it precisely on release.
- **Rate limits**: 25 requests/second per IP **and** 50 requests/second server-wide (per StatCan's docs — the server-wide limit isn't something a single deployment controls, but it means a burst from this service can be throttled even under its own per-IP budget). The MCP server should queue/throttle outbound WDS calls centrally.
- **Slow first calls happen**: one coordinate lookup was observed to take ~64 seconds on a cold call, then ~0.3s on repeat. Use a generous read timeout (120s observed in practice) and retry timeouts and 5xx errors with backoff — don't mistake a slow WDS response for a hung request.
- **Maintenance window**: tables can return HTTP 409 between midnight and 8:30 AM ET, while StatCan updates them (docs state this; not independently load-tested). The server should retry with backoff in that window and surface a "data temporarily unavailable" error rather than a raw 409 to the LLM.
- **Not for bulk**: WDS is for targeted queries. `get_data` is not a table-dump tool — full-table requests should be declined with a pointer to `GET /getFullTableDownloadCSV/{productId}/en` (returns a URL to a zip of the full table as CSV — tested and working), per the [MVP scope](mvp-scope.md)'s out-of-scope list.

## Open items

- No catalogue refresh job exists yet (`getChangedCubeList` is docs-only, untested). Decide whether incremental refresh is worth building for the MVP or whether periodic full `build-catalogue` reruns are good enough.
- No active/recency ranking boost exists yet — only an `archived` filter. Decide whether this is needed for the MVP or deferred.
- Retrieval quality has not been measured against real queries yet — `data/catalogue.json` and the OpenSearch index exist, but there's no evaluation harness (this is what the question catalogue & evaluation deliverable is for).
- Error taxonomy (ambiguous query vs. no data vs. WDS unavailable vs. rate-limited) needs to be defined precisely enough for the orchestration service to react differently to each.
