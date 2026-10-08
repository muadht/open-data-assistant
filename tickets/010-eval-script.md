# 010 — Runnable evaluation script

## Context

The actual mechanism for measuring retrieval and answer accuracy, per the brief's "Question catalogue & evaluation" deliverable. Without this, `docs/question-catalogue-eval.xlsx` is just a spreadsheet — this is what runs the agent against it and produces a score.

## Acceptance criteria

- [ ] `uv run eval` runs every row in `docs/question-catalogue-eval.xlsx` through the agent (008) and reports, per row: whether the correct table was retrieved, whether the answer value/units/reference period matched, and for the special-case rows (disambiguation, negative case), whether the agent's behavior matched what the `notes` column expects.
- [ ] Output is both a human-readable summary (pass/fail count, which rows failed and why) and a machine-readable artifact (e.g. JSON or CSV) so results can be diffed across runs.
- [ ] Rows marked `case_type` other than a plain "retrieval+answer" (disambiguation, negative case) are scored by a distinct rule, not forced into the same "does the number match" check.
- [ ] Does not require live WDS calls beyond what the agent itself legitimately makes while answering — this is an integration-level eval, not a unit test, so live calls here are expected and fine (unlike the "no live WDS calls in tests" rule, which applies to `pytest`, not this script).
- [ ] Documented in `README.md`.

## References

- `docs/question-catalogue-eval.xlsx` — including its Methodology tab, which defines the case types this script needs to handle
- Ticket 008 — the agent this script drives
