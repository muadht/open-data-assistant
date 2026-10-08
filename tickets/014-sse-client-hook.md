# 014 — Custom SSE client hook

## Context

The frontend half of the hand-rolled streaming decision in [TECH_STACK.md](../TECH_STACK.md). A small React hook that opens a connection to `POST /chat` (011), parses our own event format, and exposes message/streaming state to the UI (015). This is the piece every third-party chat framework we evaluated would otherwise have provided — see the key decision in `docs/architecture-overview.md` for why we're building it ourselves instead.

## Acceptance criteria

- [ ] A hook (e.g. `useChat`) that sends a message to `/chat`, reads the SSE stream via `fetch` + `ReadableStream` (not the `EventSource` API, which can't send a POST body), and incrementally updates React state as events arrive.
- [ ] Handles all event types defined in ticket 011: text deltas, tool-call-started/result, the final answer + `DataResult`, and the disambiguation-question event type.
- [ ] Basic error handling: a dropped connection or a non-2xx response surfaces as a visible error state, not a silent hang.
- [ ] Unit-testable without a real backend — tests feed it a mocked stream of events and assert the resulting state.
- [ ] Documented with the exact event shapes it expects, kept in sync with 011's actual implementation (ideally sharing a single source of truth for the event schema, e.g. generated types or a hand-kept comment block in both places — flag if these drift).

## References

- [TECH_STACK.md](../TECH_STACK.md) — "A hand-rolled streaming client" entry
- Ticket 011 — the backend endpoint and event format this hook consumes
