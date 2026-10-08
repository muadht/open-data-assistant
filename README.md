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
