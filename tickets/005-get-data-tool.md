# 005 — Implement `get_data`

## Context

The only tool that fetches actual data, and the most quirk-sensitive one. Builds the 10-slot coordinate, resolves (or fails to resolve) a vector ID, routes to the correct WDS endpoint, applies the scalar factor, and decodes quality flags — returning the standard `DataResult` shape shared by chat answers, charts, and exports.

## Acceptance criteria

- [ ] Implements `get_data(product_id, selections, period) -> DataResult` per [docs/mcp-tools-and-data-contract.md](../docs/mcp-tools-and-data-contract.md), using the `GetDataInput`/`DataResult` models from `schemas.py`.
- [ ] Builds the coordinate from `selections`, zero-padded to exactly 10 slots.
- [ ] Resolves the vector ID via `getSeriesInfoFromCubePidCoord`; normalizes WDS's `vectorId: 0` sentinel to `None` in the returned `DataResult` (per the schema's documented behavior).
- [ ] Distinguishes a non-existent coordinate (no title) from a real vectorless series like a Census table (has a title) — only the latter should return data; the former is an error.
- [ ] Routes correctly: `latestN` period → vector or coordinate endpoint depending on vector availability; `range` period → requires a vector ID, and raises a clear, typed error (not a vague failure) if the table has none.
- [ ] Applies the scalar factor to every value and sets `scalar_factor_applied: true` — verified against a real multi-scalar case (e.g. the GDP example in `docs/question-catalogue-eval.xlsx`, scalarFactorCode 6/millions).
- [ ] Decodes `statusCode`/`symbolCode`/`securityLevelCode` via `getCodeSets` rather than passing raw codes through.
- [ ] A suppressed value (empty `value`, non-zero status) is returned as a `DataPoint` with `value: None` and the decoded status — not dropped from `series`.
- [ ] `source_url` and `retrieved_at` are always populated.
- [ ] Tests cover, using fixtures from 001: a normal `latestN` fetch, a `range` fetch, a Census-table fetch (`latestN` only, `range` raises), a scalar-factor case, and a suppressed-value case. Cross-check at least 3 cases' expected values against the corresponding rows in `docs/question-catalogue-eval.xlsx`.

## References

- [docs/mcp-tools-and-data-contract.md](../docs/mcp-tools-and-data-contract.md) — `get_data` section and "WDS quirks"
- `src/open_data_assistant/mcp/schemas.py` — `GetDataInput`, `DataResult`, `DataPoint`
- `docs/question-catalogue-eval.xlsx` — real, verified expected values to test against
