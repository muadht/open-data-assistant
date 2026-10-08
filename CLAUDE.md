# open-data-assistant

Natural-language chat assistant over Statistics Canada's Web Data Service (WDS). Read [docs/mvp-scope.md](docs/mvp-scope.md), [docs/architecture-overview.md](docs/architecture-overview.md), and [docs/mcp-tools-and-data-contract.md](docs/mcp-tools-and-data-contract.md) before making design decisions — they are the source of truth for scope and the tool contract, not this file.

## Related repos

- `../statcan-api-exploration` — the actual tested WDS API flows (`WDS_API_FLOW.md`, `wds_helpers.py`, notebooks). If you're unsure how a WDS endpoint behaves, check there first; it's annotated with what was actually tested against the live API vs. docs-only/unverified.
- `../DataDiscovery` — the existing catalogue-search implementation (`statcan_discovery` package): `build-catalogue`, OpenSearch ingestion, hybrid BM25+kNN search. The `search_tables` MCP tool will eventually call into this (or a promoted version of it), not reimplement search from scratch.

## Layout

```
src/open_data_assistant/
  mcp/
    schemas.py       # Pydantic models for the 4 MCP tool inputs/outputs - the actual
                      # tool contract, not just documentation of it. Mirrors
                      # docs/mcp-tools-and-data-contract.md; keep both in sync.
tests/
  mcp/
    test_schemas.py   # uses real values from docs/question-catalogue-eval.xlsx, not
                       # made-up numbers
docs/                  # planning documents - read these, don't duplicate their content here
```

As the MCP server and orchestration service get built, they go under `src/open_data_assistant/` as sibling packages to `mcp/` (e.g. `agent/`, `api/`), not inside `mcp/`.

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
