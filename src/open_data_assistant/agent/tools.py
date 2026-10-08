"""The agent-facing wrappers around the four MCP tool functions (tickets #3-#5, #7).

Each wrapper takes a `RunContext[AgentDeps]` as its first parameter (Pydantic AI's dependency
injection) and otherwise mirrors the underlying tool function's signature exactly, using the
Pydantic models from `mcp/schemas.py` directly so Pydantic AI derives the tool's JSON Schema
from them - no hand-written schema.
"""

from __future__ import annotations

from pydantic_ai import RunContext

from ..mcp.schemas import DataResult, MemberCandidate, Period, TableCandidate, TableSearchFilters
from ..mcp.schemas import TableStructure as TableStructureModel
from ..mcp.tools.find_members import find_members as _find_members
from ..mcp.tools.get_data import get_data as _get_data
from ..mcp.tools.get_table_structure import get_table_structure as _get_table_structure
from ..mcp.tools.search_tables import search_tables as _search_tables
from .deps import AgentDeps


def search_tables(
    ctx: RunContext[AgentDeps],
    query: str,
    filters: TableSearchFilters | None = None,
    k: int = 10,
) -> list[TableCandidate]:
    """Search the StatCan table catalogue for tables that might answer a question.

    Returns ranked candidates, not data - call get_table_structure on a candidate's
    product_id to see its dimensions before trying to fetch data from it.
    """
    return _search_tables(
        ctx.deps.search_client, ctx.deps.search_index, ctx.deps.embedder, query, filters, k=k
    )


def get_table_structure(ctx: RunContext[AgentDeps], product_id: int) -> TableStructureModel:
    """Get a table's dimensions, frequency, and whether it's a Census table (no vector IDs,
    no date-range queries possible)."""
    return _get_table_structure(ctx.deps.wds_client, product_id)


def find_members(
    ctx: RunContext[AgentDeps], product_id: int, dimension_position_id: int, query: str
) -> list[MemberCandidate]:
    """Resolve a phrase like "Ontario" or "25 to 34 years" to member IDs within one
    dimension of one table. Member meaning is table-specific - always scope this to the
    table you're actually querying."""
    return _find_members(ctx.deps.wds_client, product_id, dimension_position_id, query)


def get_data(
    ctx: RunContext[AgentDeps],
    product_id: int,
    selections: dict[int, int],
    period: Period,
) -> DataResult:
    """Fetch actual data. `selections` maps each dimension's dimensionPositionId to a
    resolved memberId (from find_members or get_table_structure); `period` is either
    {"type": "latestN", "n": <int>} or {"type": "range", "start": ..., "end": ...} (range
    queries require the resolved series to have a vector ID - no vector means no vector,
    which get_data will report as an error rather than approximating).

    This is the only tool that returns real values - never state a number in your answer
    without having called this.
    """
    return _get_data(ctx.deps.wds_client, product_id, selections, period)
