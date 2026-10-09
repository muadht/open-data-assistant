# open-data-assistant

Natural-language chat assistant over Statistics Canada's Web Data Service (WDS). Read [docs/mvp-scope.md](docs/mvp-scope.md), [docs/architecture-overview.md](docs/architecture-overview.md), and [docs/mcp-tools-and-data-contract.md](docs/mcp-tools-and-data-contract.md) before making design decisions — they are the source of truth for scope and the tool contract, not this file.

## Git workflow: never commit directly to `main`

This repo uses GitHub Flow (see [CONTRIBUTING.md](CONTRIBUTING.md) for the full process). **This applies to you as an AI coding agent exactly as it applies to a human contributor** — it is not a convention you can skip because you're automated.

For any change beyond a trivial doc typo:

1. Create a branch off `main` (`<issue-number>-short-description`).
2. Make the change, commit there, and push the branch.
3. Open a pull request against `main` (`gh pr create`), referencing the issue it closes.
4. Do not merge it yourself unless the person you're working with explicitly says to — opening the PR and reporting back is the default; merging is their call.

If you find yourself about to run `git commit` while on `main`, stop and create a branch first.

## Related repos

- `../statcan-api-exploration` — the actual tested WDS API flows (`WDS_API_FLOW.md`, `wds_helpers.py`, notebooks). If you're unsure how a WDS endpoint behaves, check there first; it's annotated with what was actually tested against the live API vs. docs-only/unverified. Still the reference for tickets #1/#2 (WDS fixtures and the general-purpose WDS client).
- `../DataDiscovery` — the *original* catalogue-search implementation this repo's `catalogue/` and `search/` packages were migrated from (tickets #6/#7). No longer a runtime dependency of this project; it's left as-is and not being maintained from here. If you need historical context for *why* something in `catalogue/`/`search/` is built the way it is, its docstrings carry that reasoning forward, so you shouldn't need to go back to that repo.

## Layout

```
src/open_data_assistant/
  catalogue/
    wds_client.py     # Minimal WDS client scoped to catalogue-building calls
                       # (getAllCubesList, getCodeSets, getCubeMetadata). Not the same
                       # client as the one tickets #1/#2 build for the MCP tools.
    catalogue.py       # Builds the flat product catalogue (CatalogueRecord) from WDS.
    cli.py             # `build-catalogue` entrypoint -> writes data/catalogue.json.
  search/
    config.py          # OpenSearch/embedding config, overridable via env vars.
    schema.py           # OpenSearch index mapping.
    documents.py        # CatalogueRecord -> OpenSearch document.
    embeddings.py        # EmbeddingProvider protocol + SentenceTransformerEmbedder.
    query.py              # Natural-language query -> structured filters + lexical text.
    hybrid.py              # Promoted BM25 + kNN + RRF fusion (ticket #6). No Streamlit.
    indexer.py              # Bulk-indexes documents into OpenSearch.
    pipeline.py              # Orchestrates catalogue.json -> embed -> index.
    cli.py                    # `ingest-opensearch` entrypoint.
  mcp/
    schemas.py       # Pydantic models for the 4 MCP tool inputs/outputs - the actual
                      # tool contract, not just documentation of it. Mirrors
                      # docs/mcp-tools-and-data-contract.md; keep both in sync.
    tools/
      search_tables.py        # ticket #7 - uses search/hybrid.py.
      get_table_structure.py  # ticket #3.
      find_members.py         # ticket #4.
      get_data.py              # ticket #5 - the only tool that fetches actual data.
    server.py          # ticket #28 - stdio MCP server over the same 4 tools, for dev testing
                        # from VS Code etc. (`uv run mcp-server`). Not used by the agent.
  wds/
    client.py          # General-purpose WDS client for the 4 MCP tools (tickets #1/#2) -
                        # retries, rate-limits, and the WdsMaintenanceWindow/WdsInvalidRequest
                        # exceptions. Not the same client as catalogue/wds_client.py.
  agent/
    deps.py            # AgentDeps - the WDS/search clients, injected via RunContext.
    tools.py           # Agent-facing wrappers around the 4 MCP tool functions.
    system_prompt.py    # Trust/accuracy rules from docs/mvp-scope.md, as agent instructions.
    agent.py             # build_agent(model) -> Agent. Model is left unset here - see #9.
tests/              # mirrors the src/ layout above
docs/                  # planning documents - read these, don't duplicate their content here
```

As the orchestration service gets built (the FastAPI layer, ticket #11), it goes under `src/open_data_assistant/` as a sibling package (e.g. `api/`), not inside `agent/` or `mcp/`.

Running `build-catalogue`/`ingest-opensearch` for real needs a running OpenSearch instance (not set up in this repo yet - deliberately holding off on Docker until there's a backend to containerize alongside it) and will download the `sentence-transformers/all-MiniLM-L6-v2` model on first use.

## Commands

```bash
uv sync              # install deps
uv run pytest        # run tests
uv run ruff check .  # lint
uv run ruff format . # format
uv run mypy .        # type check (strict)
```

All four must pass clean before considering a change done - this project runs mypy in `strict` mode deliberately, since the Pydantic schemas are the LLM-facing tool contract and a typing mistake there is a reliability bug, not a style nit.

## Conventions

- **Python 3.12**, **uv** for everything (`uv add`, `uv run`) — no pip/poetry/conda, matching DataDiscovery.
- **Ruff**: line length 100, `E`, `F`, `I`, `UP`, `B` rules.
- **mypy strict.** Tests get relaxed `disallow_untyped_defs`/`disallow_untyped_calls` (see `pyproject.toml`), but not relaxed on `arg-type` — if a test needs to pass genuinely invalid/untyped data (e.g. to assert a `ValidationError`), use `Model.model_validate(raw_dict)`, not the typed constructor.
- **Pydantic v2** for every tool input/output. Field `description=` text is not a comment — Pydantic AI turns it into part of the JSON Schema the LLM sees, so write it for that audience.
- **No speculative abstraction.** This repo is early; don't build a plugin system, config layer, or base class for something that has exactly one implementation.
- **Comments**: none by default. Only for a non-obvious *why* (a WDS quirk, a workaround, an invariant) — not to restate what the code does.

## Rule: no live WDS calls in tests

Tests must never hit `www150.statcan.gc.ca`. The live API is rate-limited (25 req/sec per IP), has a maintenance window (HTTP 409 midnight–8:30 AM ET), and is slow to fail when it's down — none of which should ever block a test run.

- Validate new facts about WDS behavior by calling the live API by hand first (as was done for every row in `docs/question-catalogue-eval.xlsx`), then freeze the result as a fixture.
- Fixtures should live under `tests/fixtures/wds/` once the WDS client exists, covering at minimum: a normal response, a Census-table response (no vector ID), a bad/malformed coordinate (HTTP 406), a suppressed value (empty `value`, non-zero `statusCode`), and an HTTP 409 maintenance-window response. See [docs/mcp-tools-and-data-contract.md](docs/mcp-tools-and-data-contract.md)'s "WDS quirks" section for the full list of behaviors that need a fixture.
- Mock at the `httpx` transport level (`pytest-httpx` is already a dev dependency), not by stubbing out the WDS client's methods — that way the client's own request-building and response-parsing logic is still exercised.
