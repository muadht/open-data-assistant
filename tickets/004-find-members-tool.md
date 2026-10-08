# 004 — Implement `find_members`

## Context

Resolves a phrase like "Ontario" or "25 to 34 years" to member IDs within one dimension of one table. This is deliberately a live, per-table lookup rather than an index search — the catalogue index only holds near-root dimension members (see [docs/mcp-tools-and-data-contract.md](../docs/mcp-tools-and-data-contract.md)'s index design notes), so resolving a leaf-level member (e.g. a specific census geography) has to go to WDS directly.

## Acceptance criteria

- [ ] Implements `find_members(product_id: int, dimension_position_id: int, query: str) -> list[MemberCandidate]` per the data contract.
- [ ] Fetches members via `getCubeMetadata` (or a cached copy — see open item on caching in `docs/architecture-overview.md`; a naive per-call fetch is acceptable for MVP, caching can be a follow-up ticket).
- [ ] Matching is scoped to the single named dimension — a query like "Ontario" against the Geography dimension should not match members of other dimensions in the same table.
- [ ] Returns `terminated` status per member so the agent can avoid proposing a discontinued member silently.
- [ ] Tests cover: an exact name match, a case-insensitive/partial match, and a dimension with no matches (empty list, not an error).

## References

- [docs/mcp-tools-and-data-contract.md](../docs/mcp-tools-and-data-contract.md) — `find_members` section
- `src/open_data_assistant/mcp/schemas.py` — `MemberCandidate`
