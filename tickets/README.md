# Tickets

Small, buildable units covering the MVP, broken out from [docs/architecture-overview.md](../docs/architecture-overview.md) and [docs/mcp-tools-and-data-contract.md](../docs/mcp-tools-and-data-contract.md). Each ticket is sized to roughly one PR.

**These are now tracked as [GitHub Issues](https://github.com/muadht/open-data-assistant/issues) — issue number matches the ticket number below 1:1.** The files in this folder are the originals they were created from; treat the GitHub issue as the live source of truth (status, comments, linked PRs) and these files as the historical record of the original scope and acceptance criteria.

Suggested order follows dependency, not priority — e.g. the WDS client needs its fixtures to test against, and the agent needs all four MCP tools before it's useful end to end.

| # | Title | Area | Depends on |
|---|---|---|---|
| [#1](https://github.com/muadht/open-data-assistant/issues/1) | Record WDS fixtures | Backend | — |
| [#2](https://github.com/muadht/open-data-assistant/issues/2) | Build the WDS HTTP client | Backend | #1 |
| [#3](https://github.com/muadht/open-data-assistant/issues/3) | Implement `get_table_structure` | Backend | #2 |
| [#4](https://github.com/muadht/open-data-assistant/issues/4) | Implement `find_members` | Backend | #2 |
| [#5](https://github.com/muadht/open-data-assistant/issues/5) | Implement `get_data` | Backend | #2, #3 |
| [#6](https://github.com/muadht/open-data-assistant/issues/6) | Promote hybrid search out of the throwaway Streamlit tool | Backend | — |
| [#7](https://github.com/muadht/open-data-assistant/issues/7) | Implement `search_tables` | Backend | #6 |
| [#8](https://github.com/muadht/open-data-assistant/issues/8) | Wire up the Pydantic AI agent | Backend | #3, #4, #5, #7 |
| [#9](https://github.com/muadht/open-data-assistant/issues/9) | LLM provider validation spike | Backend | #8 |
| [#10](https://github.com/muadht/open-data-assistant/issues/10) | Runnable evaluation script | Backend | #8 |
| [#11](https://github.com/muadht/open-data-assistant/issues/11) | FastAPI streaming chat endpoint | Backend | #8 |
| [#12](https://github.com/muadht/open-data-assistant/issues/12) | FastAPI export endpoint | Backend | #11 |
| [#13](https://github.com/muadht/open-data-assistant/issues/13) | Scaffold the frontend | Frontend | — |
| [#14](https://github.com/muadht/open-data-assistant/issues/14) | Custom SSE client hook | Frontend | #11, #13 |
| [#15](https://github.com/muadht/open-data-assistant/issues/15) | Chat UI | Frontend | #14 |
| [#16](https://github.com/muadht/open-data-assistant/issues/16) | Chart rendering | Frontend | #15 |
| [#17](https://github.com/muadht/open-data-assistant/issues/17) | Export buttons | Frontend | #12, #15 |

Not yet ticketed, deliberately: the caching strategy for `get_table_structure`/`find_members`, and whether a catalogue refresh job is needed for MVP — both are still open design questions in [docs/architecture-overview.md](../docs/architecture-overview.md), not ready to break into a buildable unit.
