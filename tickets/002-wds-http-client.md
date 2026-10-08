# 002 — Build the WDS HTTP client

## Context

A thin `httpx`-based client wrapping the raw WDS endpoints, handling the transport-level quirks so the four MCP tools (003–005, 007) don't each reimplement retry/timeout/error logic. This is plumbing, not business logic — it doesn't build coordinates or know about dimensions; it just calls WDS methods and returns parsed JSON (or raises a typed error).

## Acceptance criteria

- [ ] A client class (or module of functions) covering: `getCubeMetadata`, `getCodeSets`, `getSeriesInfoFromCubePidCoord`, `getSeriesInfoFromVector`, `getDataFromCubePidCoordAndLatestNPeriods`, `getDataFromVectorsAndLatestNPeriods`, `getDataFromVectorByReferencePeriodRange`.
- [ ] Read timeout of at least 120s; one observed cold-start lookup took ~64s (see `WDS_API_FLOW.md`).
- [ ] Retries on timeout and HTTP 5xx, with backoff. Does not retry on 4xx (those are real errors — bad coordinate, bad vector).
- [ ] HTTP 409 during the maintenance window is caught and raised as a distinct, named exception (e.g. `WdsMaintenanceWindow`), not a generic HTTP error — so callers can give the user a clear "try again shortly" message instead of a raw failure.
- [ ] HTTP 406 (malformed coordinate, or vector 0 / non-positive `latestN`) is raised as a distinct exception too, not swallowed or retried.
- [ ] Centralized rate limiting so concurrent calls from this process stay under 25 req/sec (per-IP limit) — doesn't need to be distributed/multi-process aware for the MVP, just correct for a single running instance.
- [ ] All tests run against the fixtures from 001 via `pytest-httpx`, with zero live calls to `www150.statcan.gc.ca`.
- [ ] Tests cover at minimum: a normal response, the maintenance-window 409, the malformed-coordinate 406, and the vector-0/non-positive-latestN 406.

## References

- [docs/mcp-tools-and-data-contract.md](../docs/mcp-tools-and-data-contract.md) — "WDS quirks the server must handle"
- [CLAUDE.md](../CLAUDE.md) — "Rule: no live WDS calls in tests"
- `../statcan-api-exploration/wds_helpers.py` — existing prototype retry/timeout logic to reference, not copy verbatim (it's notebook plumbing, not typed/tested)
