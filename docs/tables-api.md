# Tables API: browsing the catalogue

Read-only endpoints behind "Browse tables" (#56, a panel beside the chat since #74), served by the same FastAPI app as
`POST /chat` ([chat-api.md](chat-api.md)). Implemented in `api/tables.py`, with the search in
`search/browse.py`.

## `GET /tables/search`

| Parameter | Meaning |
|---|---|
| `q` | Search text. Ranked with the same hybrid search as the agent's `search_tables`, up to 100 tables. |
| `subject` | A full subject path, e.g. `Prices and price indexes/Consumer price indexes`. |
| `frequency` | e.g. `Monthly`, `Annual`. |
| `from`, `to` | Years the table's coverage must overlap. |
| `include_archived` | Default `false`. |
| `sort` | `relevance` (default; with `q`) or `updated` (newest release first). With `q`, `updated` reorders the same relevant tables. |
| `page` | 1-based, 20 tables per page. |

Returns `{ total, page, page_size, results: TableCandidate[], facets }`, where `facets` has:

- `subjects`: the next level of the subject hierarchy (top-level subjects, or the children of `subject`), with counts.
- `all_subjects`: every subject at any level, with counts, so the subject filter can be searched by name.
- `frequencies`, `active`, `archived`: counts.

Without `q`, each facet is counted with every *other* filter applied but not its own, so the counts show what each choice would give. With `q`, counts are over the ranked results themselves, so they always match what's listed.

## `GET /tables/{product_id}`

`{ table: TableCandidate, subjects: string[], structure: TableStructure, source_url }`. The structure comes from WDS (`get_table_structure`, with each dimension's members, #61). 404 if the table isn't in the catalogue; 503 during WDS's maintenance window.

## `GET /tables/{product_id}/related`

Up to 5 active tables most similar to this one, by catalogue embedding (the same as an answer's related tables, #54).

## Asking about a table

`POST /chat` takes an optional `table_id`. The agent is told for that run to answer from that table and skip searching - see [chat-api.md](chat-api.md).
