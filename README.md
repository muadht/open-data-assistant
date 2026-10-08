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

## LLM provider spike

`scripts/llm_provider_spike.py` runs a real model against `docs/question-catalogue-eval.xlsx` through the real agent — see [docs/llm-provider-spike.md](docs/llm-provider-spike.md) for the results and the decision it produced. Not a test, not run by `pytest`: it makes real (billed) LLM calls and real WDS calls.

```bash
cp .env.example .env   # fill in OPENAI_API_KEY
uv run python scripts/llm_provider_spike.py                # all 15 rows
uv run python scripts/llm_provider_spike.py --rows 1,9,15   # a subset
```
