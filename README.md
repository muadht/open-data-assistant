# Open Data Assistant

Natural-language chat assistant over Statistics Canada's Web Data Service (WDS). See [docs/](docs/) for the MVP scope, architecture overview, and MCP tool contract.

## Setup

Requires Python 3.12+ and [uv](https://docs.astral.sh/uv/).

```bash
uv sync
```

## Development

```bash
uv run pytest
uv run ruff check .
uv run mypy .
```

## Building the catalogue index

Needs a running OpenSearch instance (not set up in this repo yet — see [docs/architecture-overview.md](docs/architecture-overview.md)'s open items on hosting/Docker).

```bash
uv run build-catalogue      # WDS -> data/catalogue.json (not committed; see .gitignore)
uv run ingest-opensearch    # data/catalogue.json -> OpenSearch, embedding each record
```

Both are configurable via environment variables (`OPENSEARCH_HOST`, `OPENSEARCH_PORT`, `OPENSEARCH_INDEX`, `EMBEDDING_MODEL`, etc.) — see `src/open_data_assistant/search/config.py` for the full list and defaults.

## Testing tools from VS Code

The four tools are also exposed as a stdio MCP server, so you can call them directly from an MCP client (VS Code agent mode, MCP Inspector) without running the chat agent. Development only — the agent itself calls the tools in-process, not through this server.

```bash
uv run mcp-server
```

VS Code picks it up automatically from `.vscode/mcp.json` — open the Chat view in agent mode and the `open-data-assistant` tools appear in the tools list. For other clients, point them at `uv run mcp-server` over stdio, or use the MCP Inspector: `npx @modelcontextprotocol/inspector uv run mcp-server`.

`get_table_structure`, `find_members`, and `get_data` only need WDS and work right away (they make real WDS calls). `search_tables` also needs a running OpenSearch with the catalogue index built (see above) — without it, it returns a clear "can't reach OpenSearch" error.

## LLM provider spike

`scripts/llm_provider_spike.py` runs a real model against `docs/question-catalogue-eval.xlsx` through the real agent — see [docs/llm-provider-spike.md](docs/llm-provider-spike.md) for the results and the decision it produced. Not a test, not run by `pytest`: it makes real (billed) LLM calls and real WDS calls.

```bash
cp .env.example .env   # fill in OPENAI_API_KEY
uv run python scripts/llm_provider_spike.py                # all 15 rows
uv run python scripts/llm_provider_spike.py --rows 1,9,15   # a subset
```
