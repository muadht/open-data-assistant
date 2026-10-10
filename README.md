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

## Chat API

`POST /chat` streams the agent's answer as server-sent events, in the format in [docs/chat-api.md](docs/chat-api.md). The same app serves read-only catalogue endpoints for the "Browse tables" page ([docs/tables-api.md](docs/tables-api.md)).

```bash
cp .env.example .env   # then set OPENAI_API_KEY
uv run api             # http://localhost:8010
```

It needs OpenSearch running with the catalogue index built (see "Building the catalogue index" below) and makes live calls to StatCan's WDS. The model defaults to `openai:gpt-5-mini`; set `OPEN_DATA_ASSISTANT_MODEL` to change it. Sessions live in memory, so restarting the API starts every conversation fresh.

## Frontend

The chat UI lives in `frontend/`: Vite + React + TypeScript, with shadcn/ui and prompt-kit components (see [TECH_STACK.md](TECH_STACK.md)). Needs Node 20.19+.

```bash
cd frontend
npm install
npm run dev           # dev server at http://localhost:5173
npm run build         # type-check + production build
npm run lint          # oxlint
npm run format:check  # prettier (npm run format to fix)
npm test              # unit tests (Vitest)
```

`npm test` runs the unit tests (Vitest). `npm run dev` talks to the chat API on port 8010 (start it with `uv run api`; the dev server proxies `/chat` there). To try the chat without the backend, start it with `VITE_CHAT_MOCK=1 npm run dev`: it replays the recorded streams in `frontend/src/mocks/` (see the README there). Components under `src/components/ui/` are copied in by the shadcn CLI (`npx shadcn@latest add ...`); prompt-kit's come from its registry, e.g. `npx shadcn@latest add "https://www.prompt-kit.com/c/message.json"`.

## Building the catalogue index

Needs a running OpenSearch. `docker-compose.yml` starts one locally on `localhost:9200`, which is what the defaults point at. It's dev-only (security disabled), not a deployment setup. Needs Docker running.

```bash
docker compose up -d              # start OpenSearch (data persists in a Docker volume)
uv run build-catalogue            # WDS -> data/catalogue.json (not committed; see .gitignore)
uv run ingest-opensearch --limit 200   # quick smoke test first...
uv run ingest-opensearch          # ...then the full catalogue (~8,000 tables, a few minutes)
```

`build-catalogue` makes thousands of WDS calls, so it takes a while and fails during the WDS maintenance window (midnight–8:30 AM ET). `ingest-opensearch` downloads the embedding model on first run. Re-running it overwrites documents by product ID, so it's safe to repeat. `docker compose down` stops OpenSearch and keeps the index; add `-v` to delete it.

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

`get_table_structure`, `find_members`, and `get_data` only need internet access to StatCan's WDS (they make real WDS calls). `search_tables` also needs a running OpenSearch with the catalogue index built (see [Building the catalogue index](#building-the-catalogue-index)). Without it, `search_tables` returns a clear "can't reach OpenSearch" error.

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
