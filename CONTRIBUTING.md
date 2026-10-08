# Contributing

This project uses **GitHub Flow**. `main` is always in a working, mergeable state — nobody, human or AI coding agent, commits to it directly.

## Workflow

1. Create a branch off `main`, named after the issue it closes: `<issue-number>-short-description` (e.g. `12-fastapi-export-endpoint`).
2. Make your changes there. Keep commits focused; it's fine to have several.
3. Push the branch and open a pull request against `main`. Reference the issue it closes in the PR description (e.g. `Closes #12`) so merging auto-closes it.
4. Before opening the PR, make sure the full check suite is clean:
   ```bash
   uv run pytest
   uv run ruff check .
   uv run mypy .
   ```
5. Get it reviewed (even a quick self-review counts if no one else is free) and merge. Delete the branch afterward.

See [docs/architecture-overview.md](docs/architecture-overview.md) and [docs/mcp-tools-and-data-contract.md](docs/mcp-tools-and-data-contract.md) for the design this project is built against, and the repo's [Issues](../../issues) for what's left to build.

## This applies equally to AI coding agents

If you're an AI coding agent (Claude Code, Cursor, Codex, or anything else) working in this repo: the rule above is not a human-only convention. Create a branch and open a PR for any change, the same as a human contributor would — see [CLAUDE.md](CLAUDE.md) / [AGENTS.md](AGENTS.md) for the rest of this project's agent-specific conventions.
