# 003 — Implement `get_table_structure`

## Context

Wraps `getCubeMetadata` (+ `getCodeSets`) to return a `TableStructure` — the dimensions, their top-level members, scalar factor, and whether this is a Census table. This is what the agent calls right after `search_tables` to learn what can be asked of a chosen table, before resolving specific member phrases with `find_members` (004).

## Acceptance criteria

- [ ] Implements the `get_table_structure(product_id: int) -> TableStructure` tool per [docs/mcp-tools-and-data-contract.md](../docs/mcp-tools-and-data-contract.md), returning the `TableStructure` Pydantic model from `src/open_data_assistant/mcp/schemas.py`.
- [ ] `is_census_table` is derived from the productId prefix (`9810...`), not fetched from WDS.
- [ ] `default_scalar_factor` is decoded via `getCodeSets`, not left as a raw code.
- [ ] Registered as a Pydantic AI tool (see 008) with the field descriptions from `schemas.py` intact — they're part of what the LLM sees.
- [ ] Tests use the `getCubeMetadata`/`getCodeSets` fixtures from 001 — covers at least one ordinary table and one Census table, asserting `is_census_table` is set correctly for each.

## References

- [docs/mcp-tools-and-data-contract.md](../docs/mcp-tools-and-data-contract.md) — `get_table_structure` section
- `src/open_data_assistant/mcp/schemas.py` — `TableStructure`, `DimensionInfo`
