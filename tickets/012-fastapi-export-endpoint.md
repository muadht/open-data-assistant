# 012 — FastAPI export endpoint

## Context

Generates CSV/Excel/JSON from the same `DataResult` already produced for a chat answer — not a fresh WDS fetch. See [docs/architecture-overview.md](../docs/architecture-overview.md)'s "answer → export" sequence.

## Acceptance criteria

- [ ] A `POST /export` endpoint taking a reference to a previous answer's `DataResult` (e.g. a session + message id, or the `DataResult` itself if the frontend holds it) and a requested format (`csv` | `xlsx` | `json`).
- [ ] CSV and JSON use the Python standard library; Excel uses `openpyxl` (already a dependency, proven in `docs/question-catalogue-eval.xlsx`) — no new export library introduced.
- [ ] The exported file's numbers match the chat answer exactly — same values, units, reference periods, and quality-flag annotations, not a re-derived or re-fetched copy.
- [ ] No WDS call happens as part of serving an export — this is a pure transform of already-fetched data, which is the entire point of this decision (see architecture doc's key decisions table).
- [ ] Tested for all three formats against a sample `DataResult`, including one with a suppressed value (`None`) to confirm it's represented clearly in the export rather than silently blank.

## References

- [docs/architecture-overview.md](../docs/architecture-overview.md) — "answer → export" sequence diagram, and the export key decision
- [TECH_STACK.md](../TECH_STACK.md) — export formats section
