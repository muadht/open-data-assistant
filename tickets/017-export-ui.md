# 017 — Export buttons

## Context

The frontend half of the export flow (012) — lets the user request CSV/Excel/JSON for the answer they're looking at.

## Acceptance criteria

- [ ] Export controls (e.g. a button with a format picker) appear alongside any answer that has a `DataResult` — not shown for answers with no data (e.g. a pure disambiguation question).
- [ ] Clicking export calls `POST /export` (012) with a reference to that answer's `DataResult` and triggers a browser download of the returned file.
- [ ] Loading/error states are visible (export can fail — e.g. a malformed request — and the user should see that, not a silent no-op).
- [ ] Manually verified for all three formats that the downloaded file's content matches what's shown in the chat answer (same values, units, flags).

## References

- [docs/architecture-overview.md](../docs/architecture-overview.md) — "answer → export" sequence diagram
- Ticket 012 — the backend endpoint this calls
