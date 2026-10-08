# 006 — Promote hybrid search out of the throwaway Streamlit tool

## Context

The RRF fusion of BM25 + kNN search currently exists only in `DataDiscovery/tools/search_app.py`, explicitly marked as a disposable tool for manual testing. `search_tables` (007) needs this as an importable function in `src/statcan_discovery/search/`, not copy-pasted Streamlit code.

## Acceptance criteria

- [ ] `bm25_search`, `knn_search`, and the RRF fusion logic (currently in `search_app.py`) are moved into `statcan_discovery.search` as plain functions taking an `OpenSearch` client and returning typed results — no Streamlit import anywhere in the moved code.
- [ ] The existing query-parsing step (`statcan_discovery.search.query.parse_query`, `build_filters`, `build_lexical_query`) is reused as-is, not reimplemented.
- [ ] `tools/search_app.py` is updated to import the promoted functions rather than defining its own copies, so there's one implementation, not two that can drift.
- [ ] Unit tests exist for the promoted functions against a test OpenSearch index (or a mocked client) — this code currently has none.
- [ ] No change to ranking behavior — this is a pure refactor/promotion, not a ranking-quality change.

## References

- [docs/mcp-tools-and-data-contract.md](../docs/mcp-tools-and-data-contract.md) — "Implementation gap" note under `search_tables`, and the "Index design and refresh" section
- `../DataDiscovery/tools/search_app.py` — code to move
