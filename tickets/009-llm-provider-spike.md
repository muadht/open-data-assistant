# 009 — LLM provider validation spike

## Context

[docs/architecture-overview.md](../docs/architecture-overview.md) deliberately deferred the LLM provider choice: Pydantic AI makes the wire format swappable, but tool-calling *reliability* on the `search_tables → find_members → get_data` chain is not standardized across providers. This ticket is the spike that actually picks one, using real measurement instead of a guess. Time-boxed — this is a spike, not a full eval-framework build.

## Acceptance criteria

- [ ] At least 2–3 candidate models run against the full `docs/question-catalogue-eval.xlsx` catalogue (expand it first if more coverage is needed — see its Methodology tab).
- [ ] For each candidate, record: retrieval accuracy (right table chosen), answer accuracy (right value/units/period), and whether it correctly handled the catalogue's harder rows (the disambiguation case, the negative/not-answerable case, the scalar-factor case).
- [ ] A short write-up (can be a markdown file in this repo, or an update to `docs/architecture-overview.md`'s open questions) states which model was chosen and why, with the actual numbers — not just a vibe.
- [ ] `TECH_STACK.md` and `docs/architecture-overview.md` are updated to reflect the decision once made (remove "deferred" language).

## References

- [docs/architecture-overview.md](../docs/architecture-overview.md) — "LLM provider: deferred" open question
- `docs/question-catalogue-eval.xlsx`
- Ticket 010 (the eval script) — natural to build this spike as the first real use of that script, if 010 lands first
