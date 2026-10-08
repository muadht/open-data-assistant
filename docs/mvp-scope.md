# MVP Scope: StatCan Natural-Language Data Assistant

## Users

Primary user for the MVP is the **general public**: people with no training in StatCan terminology, table structures, or statistical methods, asking plain-language questions about Canadian statistics. This shapes two things everywhere else in the project:

- Answers must be in plain language first, with technical detail (table IDs, vector IDs, dimension names) available as supporting detail, not the headline.
- The system must guard against users over-reading or misinterpreting data (e.g. confusing a rate with a count, treating a preliminary period as final, missing a quality flag on a suppressed value).

Analysts, researchers, and internal staff are not excluded, but the MVP is not tuned for their workflows (e.g. no bulk export of whole tables, no raw coordinate-building UI).

## Language

**English only for the MVP.** French is a known future requirement (StatCan is a bilingual institution) but is explicitly out of scope for this phase. This simplifies the embedding model choice and the catalogue index (EN titles/metadata only). Revisit before any public launch — French support is not a "nice to have" to defer indefinitely, just not required to prove the concept.

## Top questions (representative, not exhaustive)

The question catalogue (separate deliverable) will have 50–100 of these, but the MVP should be designed around questions shaped like:

- "What's the unemployment rate in Ontario?"
- "How has the CPI changed over the last 5 years?"
- "What's the population of Canada by province?"
- "Show me average weekly earnings by industry."
- "What was inflation in 2023 vs 2024?"

Common shape: one or two metrics, one or two dimensions (geography, time, industry/age/sex), a recent or ranged time window. Census-only tables (9810-series) and highly multidimensional queries are supported but not the primary design target.

## In scope

- Natural-language Q&A over StatCan WDS data (targeted queries, not full table dumps).
- Discovery: resolving a question to the right table and member IDs without the user knowing StatCan's data model.
- One chart per answer, rendered from the same structured data as the text answer.
- Export of the returned data (not the full source table) as CSV, Excel, and JSON.
- Source citation, reference period, and quality flags on every answer.
- Disambiguation: if more than one table could plausibly answer the question, ask the user rather than guessing.

## Out of scope (for MVP)

- French language support.
- Bulk/full-table downloads (point users to StatCan's own CSV downloads for that).
- Historical/discontinued table versions and vintage comparisons.
- User accounts, saved queries, or personalization.
- Any analysis beyond what WDS returns directly (no derived statistics, forecasting, or cross-table computation).
- Mobile app / non-web clients.

## Success criteria

- **Retrieval accuracy**: for the question catalogue, the discovery layer finds the correct table in the top-N candidates at a target rate (e.g. ≥90% top-3) — exact bar to be set when the catalogue exists and a baseline is measured.
- **Answer accuracy**: the final answer's value, reference period, and units match the expected answer in the catalogue.
- **Every answer is sourced**: table ID, reference period, and any active quality flags are visible to the user, not just the number.
- **Graceful disambiguation and failure**: when a question is ambiguous or unanswerable from WDS, the system says so and asks a clarifying question, rather than returning a confident wrong answer.
- **Latency**: answer returned within a few seconds for a typical targeted query (exact target TBD, bounded partly by the 25 req/sec WDS rate limit).

## Accuracy and trust rules

These apply to every answer, chart, and export, not just happy-path queries:

1. Always cite the source table (and series/vector where applicable).
2. Always show the reference period(s) the data covers.
3. Always surface quality flags (status, symbol, security) attached to the data points used; never silently drop a suppressed value without saying so.
4. When multiple tables could answer a question, ask the user to disambiguate rather than picking one silently.
5. Never let the LLM construct a table/coordinate/vector ID itself — only the backend (MCP server) builds these from resolved, validated selections.

## Open questions carried forward

- **LLM provider**: deferred. Architecture should stay provider-agnostic where possible; revisit before building the orchestration service.
- **Hosting constraints** (government cloud, data residency): not yet resolved — may affect where the service and OpenSearch index can run.
- **Internal/analyst use case**: not in MVP scope, but worth revisiting once the general-public flow works, since it may reuse most of the same stack.
