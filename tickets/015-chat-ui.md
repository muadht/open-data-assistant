# 015 — Chat UI

## Context

Wires prompt-kit's chat components (message bubbles, prompt input, streaming display) to the `useChat` hook from 014, producing the actual conversation UI.

## Acceptance criteria

- [ ] Message list renders user and assistant turns, with the assistant's text streaming in as deltas arrive (not appearing all at once at the end).
- [ ] Tool-call-started events render as a visible, lightweight status (e.g. "Searching tables...", "Looking up Ontario...") rather than being invisible to the user — this is part of the transparency/trust UX the MVP scope calls for.
- [ ] The disambiguation-question event type renders distinctly from a normal answer (e.g. as selectable options or a clearly-flagged clarifying question), per the MVP scope's trust rules.
- [ ] Every completed answer visibly shows its source citation, reference period, and any quality flags — not just the number — per [docs/mvp-scope.md](../docs/mvp-scope.md)'s accuracy and trust rules.
- [ ] Markdown in the assistant's answer (links, lists) renders correctly.
- [ ] Basic accessibility: keyboard-navigable input, reasonable focus management when a new message arrives.

## References

- [docs/mvp-scope.md](../docs/mvp-scope.md) — accuracy and trust rules
- Ticket 014 — the hook this UI consumes
- [TECH_STACK.md](../TECH_STACK.md) — prompt-kit, shadcn/ui
