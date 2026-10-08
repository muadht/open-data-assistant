# 011 — FastAPI streaming chat endpoint

## Context

The HTTP surface the frontend actually talks to. Per [TECH_STACK.md](../TECH_STACK.md), this emits our own SSE event format (not the Vercel AI SDK protocol or AG-UI) — we control both ends, so the format just needs to be simple and sufficient, not compatible with any third-party chat framework's runtime.

## Acceptance criteria

- [ ] A `POST /chat` endpoint accepting a message and a session identifier, streaming back Server-Sent Events as the agent (008) produces them.
- [ ] Event format covers, at minimum: text deltas, a tool-call-started event (so the UI can show "searching tables...", etc.), a tool-call-result event, and a final event carrying the completed `DataResult` (for charting) alongside the answer text.
- [ ] Conversation state is held per session across requests (in-process store is fine for MVP; note in code that this won't survive a restart or scale past one instance).
- [ ] If the agent needs to ask the user to disambiguate (per the MVP scope's trust rules), that's a distinct event type the frontend can render differently from a normal answer — not just plain text indistinguishable from a final answer.
- [ ] Basic request logging (per [docs/architecture-overview.md](../docs/architecture-overview.md)'s mention of guardrails/logging living in the orchestration service).
- [ ] Tested with the agent mocked/stubbed — this endpoint's tests should not require a real LLM call.

## References

- [docs/architecture-overview.md](../docs/architecture-overview.md) — "question → answer" sequence diagram, orchestration service component description
- Ticket 008 — the agent this endpoint wraps
- Ticket 014 — the frontend's client for this exact event format; keep them in sync
