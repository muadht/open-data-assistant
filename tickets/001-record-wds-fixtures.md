# 001 — Record WDS fixtures

No code in this repo is allowed to call the live WDS API in tests (see [CLAUDE.md](../CLAUDE.md)). Before the WDS client (002) can be tested, we need real recorded responses to test against.

## Context

[docs/mcp-tools-and-data-contract.md](../docs/mcp-tools-and-data-contract.md)'s "WDS quirks" section lists the specific failure modes the client must handle. Each one needs a fixture, captured from the *real* API (as was done for `docs/question-catalogue-eval.xlsx`), not hand-written.

## Acceptance criteria

- [ ] `tests/fixtures/wds/` contains one recorded JSON response per case:
  - [ ] Normal `getDataFromVectorsAndLatestNPeriods` response (e.g. Ontario unemployment rate, vector 2063949)
  - [ ] Census table response — `getDataFromCubePidCoordAndLatestNPeriods` for a 9810-series productId, showing `vectorId: 0` on a real series (has a title)
  - [ ] A non-existent coordinate — same `vectorId: 0` shape but with empty fields, to contrast with the Census case
  - [ ] HTTP 406 response body for a malformed (non-10-slot) coordinate
  - [ ] HTTP 406 response body for a vector-based call with `vectorId: 0` or `latestN <= 0`
  - [ ] A suppressed value — a real or constructed data point with empty `value` and a non-zero `statusCode`
  - [ ] HTTP 409 response during the maintenance window
  - [ ] A `getCubeMetadata` response and a `getCodeSets` response (needed by 003/004/005)
- [ ] Each fixture file has a one-line comment (in an adjacent `.md` or in the test that loads it) noting which real request produced it and when, so it's traceable back to a live call if WDS's shape ever changes.
- [ ] A small loader helper exists (e.g. `tests/fixtures/wds/__init__.py` or a pytest fixture) so tests can request a fixture by name rather than reading JSON files inline.

## References

- [docs/mcp-tools-and-data-contract.md](../docs/mcp-tools-and-data-contract.md) — "WDS quirks the server must handle"
- `../statcan-api-exploration/WDS_API_FLOW.md` — real, tested request/response shapes to capture
