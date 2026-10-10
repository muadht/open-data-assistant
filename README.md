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

## Using the tools from an AI coding agent (MCP)

The four tools are also exposed as a stdio MCP server, so you can call them directly from VS Code's agent mode or Claude Code, without running the chat agent. Development only: the chat agent itself calls the tools in-process, not through this server.

The repo already includes the config for both clients, so there's nothing to register by hand:

| Client | Config file (committed) |
|---|---|
| VS Code agent mode (Copilot Chat) | `.vscode/mcp.json` |
| Claude Code (CLI or VS Code extension) | `.mcp.json` |

**One-time setup**

1. Install [uv](https://docs.astral.sh/uv/) and run `uv sync` in the repo. Do this before the first launch: the first sync downloads large dependencies (PyTorch for the embedding model), and a client may time out waiting for the server if it has to sync on startup.
2. Check that the server starts: `uv run mcp-server` should sit silently waiting for input. Press Ctrl+C to stop it.

**VS Code agent mode**

Open the repo folder in VS Code, open the Chat view, and switch to **Agent** mode. VS Code shows a prompt to start or trust the `open-data-assistant` server. Accept it, and its four tools appear under the tools (🔧) picker. To restart it or view its logs, run **MCP: List Servers** from the command palette.

**Claude Code**

Start a new Claude Code session in the repo. The first time, it asks you to approve the project's `open-data-assistant` server. Approve it. Run `/mcp` to confirm the server is connected with 4 tools. They appear as `mcp__open-data-assistant__<tool>`.

**What works without extra setup**

`get_table_structure`, `find_members`, and `get_data` only need internet access to StatCan's WDS (they make real WDS calls). `search_tables` also needs a running OpenSearch with the catalogue index built (see above). Without it, `search_tables` returns a clear "can't reach OpenSearch" error.

Try: *"Use find_members to look up Ontario in table 14100287, then get_data for the latest unemployment rate there."*

**Troubleshooting**

- **"spawn uv ENOENT" / server fails to start:** the client can't find `uv`. Apps launched from the Dock or Start menu may not inherit your shell's `PATH`. Launch VS Code from a terminal (`code .`), or install uv somewhere on the system `PATH`.
- **Server times out on first start:** run `uv sync` once in a terminal, then restart the server.
- **Anything else:** the MCP Inspector shows the raw requests and responses: `npx @modelcontextprotocol/inspector uv run mcp-server`.

## LLM provider spike

`scripts/llm_provider_spike.py` runs a real model against `docs/question-catalogue-eval.xlsx` through the real agent — see [docs/llm-provider-spike.md](docs/llm-provider-spike.md) for the results and the decision it produced. Not a test, not run by `pytest`: it makes real (billed) LLM calls and real WDS calls.

```bash
cp .env.example .env   # fill in OPENAI_API_KEY
uv run python scripts/llm_provider_spike.py                # all 15 rows
uv run python scripts/llm_provider_spike.py --rows 1,9,15   # a subset
```
