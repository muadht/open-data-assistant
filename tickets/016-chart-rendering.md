# 016 — Chart rendering

## Context

Renders a chart from the `DataResult` carried by the final SSE event (011, 014) — no separate fetch or "generate a chart" round trip, per [docs/architecture-overview.md](../docs/architecture-overview.md)'s "answer → chart" sequence.

## Acceptance criteria

- [ ] A chart component (Recharts) takes a `DataResult.series` and renders a line or bar chart as appropriate (e.g. a single-point "latest value" answer may be better as a stat callout than a one-point chart — define a simple rule for when to chart vs. not).
- [ ] Tooltips show the reference period, value with units, and any quality flag for that point — charts carry the same trust information as the text answer, not just the number.
- [ ] A suppressed value (`value: None`) renders as a visible gap, not a silently-skipped point that makes the line look continuous when it isn't.
- [ ] Handles the scalar-factor case correctly — chart values reflect the already-scaled `value` field, no double-applying or re-deriving the scalar factor client-side.
- [ ] Renders correctly for a range-period answer (many points) and a single latestN=1 answer (one point) without special-casing the component's public interface.

## References

- [docs/architecture-overview.md](../docs/architecture-overview.md) — "answer → chart" sequence diagram
- [TECH_STACK.md](../TECH_STACK.md) — Recharts choice and reasoning
- `src/open_data_assistant/mcp/schemas.py` — `DataResult`, `DataPoint`
