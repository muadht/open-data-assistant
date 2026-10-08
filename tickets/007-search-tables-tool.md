# 007 — Implement `search_tables`

## Context

The entry point to every question: resolves a natural-language query to ranked candidate tables, using the promoted hybrid search from 006 plus the existing regex-based query parsing (year/frequency/identifier extraction) already implemented in `statcan_discovery.search.query`.

## Acceptance criteria

- [ ] Implements `search_tables(query: str, filters: TableSearchFilters | None) -> list[TableCandidate]` per [docs/mcp-tools-and-data-contract.md](../docs/mcp-tools-and-data-contract.md), using the schema from `schemas.py`.
- [ ] Runs the query through `parse_query` first; an exact productId/CANSIM-id match short-circuits straight to that table rather than going through ranking.
- [ ] The `filters` argument is merged with (not overridden by, and does not override) whatever `parse_query` already extracted from the query text.
- [ ] Uses the promoted `hybrid_search` from 006 — no reimplementation of BM25/kNN/RRF in this tool.
- [ ] Returns `TableCandidate` objects with `is_active` correctly derived from the index's `archived` field.
- [ ] Tests cover: an unambiguous query, a query containing an explicit productId, a query containing a year range, and a query matching multiple plausible tables (verifying more than one candidate comes back, so the agent has what it needs to disambiguate per the MVP scope's trust rules).

## References

- [docs/mcp-tools-and-data-contract.md](../docs/mcp-tools-and-data-contract.md) — `search_tables` section
- [docs/mvp-scope.md](../docs/mvp-scope.md) — disambiguation rule
- `src/open_data_assistant/mcp/schemas.py` — `TableCandidate`, `TableSearchFilters`
