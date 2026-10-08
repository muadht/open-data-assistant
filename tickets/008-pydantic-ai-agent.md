# 008 — Wire up the Pydantic AI agent

## Context

The actual agent loop: a Pydantic AI `Agent` registered with all four MCP tools (003–005, 007), a system prompt encoding the MVP's trust/accuracy rules, and conversation-history handling. This is the thing [docs/architecture-overview.md](../docs/architecture-overview.md)'s FastAPI layer (011) will call into.

## Acceptance criteria

- [ ] An `Agent` instance with `search_tables`, `get_table_structure`, `find_members`, and `get_data` registered as tools, using the Pydantic models from `schemas.py` directly (no hand-written JSON Schema).
- [ ] System prompt encodes, at minimum, the trust rules from [docs/mvp-scope.md](../docs/mvp-scope.md): always cite the source table and reference period, always surface quality flags, ask the user when multiple tables could answer a question rather than guessing, never state a number without having actually called `get_data`.
- [ ] Conversation history is passed in and threaded through correctly across multiple turns (tested with at least one multi-turn exchange, e.g. a follow-up question referring to the previous answer's table).
- [ ] Tool-call arguments that fail Pydantic validation are surfaced back to the model as a validation error it can react to (e.g. retry with corrected arguments), not an unhandled exception.
- [ ] Runs end-to-end against at least 3 questions from `docs/question-catalogue-eval.xlsx` (using a mocked/stubbed LLM response or a real call behind a flag — do not require live LLM calls for the test suite by default) and produces an answer whose `DataResult` matches the expected row.

## References

- [docs/architecture-overview.md](../docs/architecture-overview.md) — "question → answer" sequence diagram
- [docs/mvp-scope.md](../docs/mvp-scope.md) — accuracy and trust rules
- Tickets 003, 004, 005, 007 — the tools this agent registers
