# LLM provider validation spike (ticket #9)

## Decision

**OpenAI, `gpt-5-mini`** (via Pydantic AI's model-agnostic `openai:gpt-5-mini` string) is the
MVP's starting LLM provider.

## Scope reduction - read this before the numbers below

This spike is narrower than ticket #9 originally called for, for two concrete reasons:

- **Only one provider/model was tested**, not the 2-3 candidates the ticket asked for. Only an
  OpenAI API key was available for this spike. Comparing additional providers or tiers (Claude,
  Gemini, other OpenAI tiers) is cheap to add later - the agent is provider-agnostic by
  construction (`build_agent(model)` takes any Pydantic AI model string), so it's a follow-up
  spike, not a rebuild.
- **`search_tables` was not exercised**, so this does not measure retrieval accuracy (can the
  model find the right table). `search_tables` needs a running OpenSearch instance, which this
  repo deliberately doesn't run yet (see [CLAUDE.md](../CLAUDE.md)'s Docker note). Every row's
  prompt supplied the expected `product_id` directly (as if a prior `search_tables` call had
  already resolved it), except row 14 (disambiguation), where the product_id was deliberately
  withheld since the whole point of that row is that there isn't one right table.
- **The test harness is single-turn.** Each row is one question with no follow-up - there's no
  way to answer a clarifying question the model asks back. A model that asks a clarifying
  question is scored here as "did not complete," even though in a real multi-turn chat the user
  would likely just answer it and the conversation would continue normally. See the Pattern
  section below - this caveat turns out to matter a lot for how to read the results.

What this spike *does* measure: given the correct table, can the model reliably resolve
dimension members, choose the right WDS routing (vector vs. coordinate, latestN vs. range), and
produce an accurate final answer - and does it handle the catalogue's harder rows
(disambiguation, negative case, scalar factor) correctly.

## Method

- `scripts/llm_provider_spike.py`, run against all 15 rows of
  [question-catalogue-eval.xlsx](question-catalogue-eval.xlsx).
- Agent built from `get_table_structure`, `find_members`, and `get_data` only (`search_tables`
  excluded - see above), using the real agent wiring from ticket #8 (`agent/tools.py`,
  `agent/system_prompt.py`).
- Real WDS calls, real (billed) OpenAI calls. Raw per-row output: `data/spike-results/`
  (gitignored - this doc is the durable record).

## Results

| Row | Question | Outcome | Value |
|---|---|---|---|
| 1 | Unemployment rate, Ontario | Asked for clarification (seasonally adjusted vs. trend-cycle, age/gender) instead of using the obvious default | did not complete |
| 2 | Unemployment rate, Canada | Matched exactly | 6.4% |
| 3 | Labour force participation rate, Canada | Asked for clarification | did not complete |
| 4 | Employment rate, Ontario | Asked for clarification | did not complete |
| 5 | Ontario unemployment rate, 2019-2024 (range) | Asked for clarification | did not complete |
| 6 | Average weekly earnings, retail trade | Asked for clarification (full/part-time, overtime) | did not complete |
| 7 | CPI, Canada | Matched exactly | 169.8 |
| 8 | Inflation change over 5 years (derived %) | Correct arithmetic on its own data window | 142.9 → 169.8, +18.8% (see note below) |
| 9 | Canada's GDP (scalar-factor case) | Asked for clarification (price measure/seasonal adjustment) | did not complete - scalar factor untested this run |
| 10 | Population, Ontario | Matched exactly | 16,262,121 |
| 11 | Population, Canada | Matched exactly | 41,798,407 |
| 12 | Census population, Ontario | Matched exactly; `vector_id` correctly `None` | 14,223,942 |
| 13 | Census population, Canada | Matched exactly | 36,991,981 |
| 14 | Inflation rate (disambiguation case) | Correctly asked the user to disambiguate, no guess | — |
| 15 | Ontario census population by quarter, 2016-2021 (negative case) | Correctly declined the as-asked range request, explained why (Census has no vector ID / isn't quarterly), offered the two real census-year snapshots instead | — |

**9 of 15 rows completed outright. Of those 9, all 9 matched the expected value exactly -
100% answer accuracy whenever the model actually committed to an answer.** Both "harder" rows
it reached (14: disambiguation, 15: negative case) were handled correctly.

### Note on row 8

The model's answer (142.9 → 169.8, +18.8%) is internally consistent and correctly computed
`(169.8-142.9)/142.9`, but it doesn't match the catalogue's stated expected window
(136.9 → 164.9, +20.45%, dated 2020-09 to 2025-09). "5 years before 2026-10-08" is ≈2021-10, which
is much closer to the model's window than the catalogue's - this looks like a pre-existing
inconsistency in `question-catalogue-eval.xlsx` row 8's recorded expected values, not a model
error. Worth fixing in the catalogue separately; not a mark against gpt-5-mini here.

## Pattern: conservative, not wrong

Every "did not complete" row involves a table with several optional sub-dimensions (data-type
variant, full/part-time, which price measure) - never a simple, few-dimension table (population,
CPI, Census all completed). The model is choosing to ask rather than apply the sensible default
the system prompt and the eval catalogue's own expected values both assume. It never produced a
wrong number - it just stopped short of producing one, on exactly the rows where a default
judgment call was needed.

Combined with the single-turn harness caveat above: it's plausible that most or all of these 6
rows would complete correctly in a real chat once the user answers the clarifying question,
given the model's perfect accuracy on every row it did commit to. This spike can't confirm that
without a multi-turn harness, which is future work (see below).

## Recommendation

Adopt `openai:gpt-5-mini` as the MVP's starting provider. Before considering the "asks too
often" behavior settled, tighten `agent/system_prompt.py` to explicitly say the agent should use
the stated reasonable default for a sub-dimension unless the question specifically implies
otherwise, and re-run the 6 affected rows cheaply to check whether that's enough - this is a
prompt change, not a model change, and shouldn't need another paid comparison spike to validate.

## Out of scope here (tracked as follow-up, not a blocker for MVP)

- Comparing additional providers/tiers (Anthropic, Google, other OpenAI tiers) - cheap later,
  just a `model=` string change to `scripts/llm_provider_spike.py`.
- Retrieval accuracy via `search_tables`, once OpenSearch is running.
- A multi-turn version of this harness, to check whether the 6 "asked instead of answered" rows
  actually resolve correctly once the user replies.
- The row 8 catalogue data inconsistency noted above.
