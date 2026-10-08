# Tech Stack

This repo holds both the backend (Python) and the frontend (TypeScript) for the MVP — see [docs/architecture-overview.md](docs/architecture-overview.md) for why they live in one repo rather than two. CI and editor tooling are scoped by directory (`src/`, `tests/` for Python; `frontend/` for TypeScript), not shared.

## Backend — orchestration service + MCP server

- **Python 3.12**
- **uv** for dependencies, virtualenvs, and running things — no pip/poetry/conda. `uv sync`, `uv add <pkg>`, `uv add --dev <pkg>`, `uv run <cmd>`. Commit `uv.lock`.
- **FastAPI** — the HTTP/streaming surface the frontend talks to; see [docs/architecture-overview.md](docs/architecture-overview.md) for the split between it and the agent.
- **Pydantic AI** — the agent loop: model-agnostic LLM calls, MCP tool execution, tool-argument validation against the schemas in `src/open_data_assistant/mcp/schemas.py`.
- **Pydantic v2** — every tool input/output and API request/response model. Same models back the agent's tool contract and the API layer.
- **Ruff** for linting + formatting (`uv run ruff check .`, `uv run ruff format .`).
- **mypy** (strict) for type checking (`uv run mypy .`).
- **pytest** + **pytest-httpx** for tests, under `tests/` (`uv run pytest`). `pytest-httpx` mocks WDS at the transport level — see CLAUDE.md's "no live WDS calls in tests" rule.

## Search / catalogue

- **OpenSearch**, hybrid BM25 + kNN (RRF) ranking — already built and populated in the `DataDiscovery` repo (`statcan_discovery` package). `search_tables` will call into a promoted version of that package rather than reimplementing search.
- **sentence-transformers/all-MiniLM-L6-v2** — the embedding model, run locally (CPU-forced; see [docs/mcp-tools-and-data-contract.md](docs/mcp-tools-and-data-contract.md) for why).

## LLM provider

**OpenAI, `gpt-5-mini`** (via Pydantic AI's model-agnostic config — Claude, Gemini, Mistral, and others remain swappable without rewriting agent code). Chosen via a validation spike against [docs/question-catalogue-eval.xlsx](docs/question-catalogue-eval.xlsx): 100% answer accuracy on every row it completed, including the disambiguation and negative-case rows, but conservative about asking clarifying questions on tables with several optional sub-dimensions rather than using sensible defaults. Only one provider/model was actually compared (budget/key availability) — see [docs/llm-provider-spike.md](docs/llm-provider-spike.md) for the full results and what's still open.

## Frontend

- **Vite + React + TypeScript**, in `frontend/` at the repo root. Vite rather than Next.js: Next.js's main value is server-side rendering and API routes, and we don't need either — FastAPI is already the backend, so a plain SPA build tool is a better fit than a second server-capable framework we'd only use half of.
- **npm** as the package manager. No strong reason to need pnpm/yarn's extra speed or workspace features at this scale; picked for being the lowest-friction default, not because of any constraint — easy to revisit.
- **shadcn/ui** (+ Radix UI primitives, Tailwind CSS) for base components (buttons, dialogs, dropdowns, tooltips). Distributed as component source you copy into the repo, not an installed black-box dependency — fully customizable, and it's the same foundation nearly every chat-UI framework in this space (assistant-ui, CopilotKit, Vercel's own templates) is already built on, so we get the same visual/accessibility baseline without adopting any of their backend assumptions.
- **prompt-kit** for chat-specific UI (message bubbles, prompt input, streaming response display, conversational layout). Same distribution model as shadcn/ui (copy the source, own it) and explicitly backend-agnostic — it doesn't assume the Vercel AI SDK or any particular streaming protocol, unlike Vercel's own similarly-named "AI Elements" kit, which does and should not be confused with this.
- **A hand-rolled streaming client**, not a third-party chat framework's runtime. FastAPI emits our own SSE event format (text deltas, tool-call events, the final `DataResult`); a small custom React hook (`fetch` + `ReadableStream`) reads it. This was a deliberate choice after evaluating assistant-ui, CopilotKit (AG-UI), Chainlit, LibreChat, and Open WebUI — every one of them assumes either a specific backend protocol (Vercel AI SDK, AG-UI) or that *it* owns the whole backend/storage/auth stack. Since we already have a working FastAPI + Pydantic AI backend we want to keep, owning both ends of a simple wire format removes that entire category of integration risk, at the cost of writing a bit more UI glue code ourselves (message state, auto-scroll, retry) than a framework would give for free.
- **Charting**: **Recharts**. Reasoning: StatCan answers are mostly simple time series (one or a few lines) with units, reference periods, and quality flags to surface in tooltips — Recharts covers this with a much smaller API surface than a D3-based library like visx, and the MVP doesn't need the latter's level of custom-mark control. Revisit if the chart needs grow more custom (e.g. overlaying quality-flag markers directly on the line) than Recharts comfortably supports.

## Export formats

- **CSV / JSON**: native (Python standard library) — no dependency needed.
- **Excel (.xlsx)**: `openpyxl` — already proven in this repo for `docs/question-catalogue-eval.xlsx`. Reused server-side for user-requested Excel exports rather than introducing a second library.

All three are generated from the same `DataResult` object that backs the chat answer (see [docs/architecture-overview.md](docs/architecture-overview.md)'s "answer → export" sequence) — no separate export-specific data fetch.
