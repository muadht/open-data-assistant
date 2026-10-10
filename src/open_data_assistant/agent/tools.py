"""The agent-facing wrappers around the four MCP tool functions (tickets #3-#5, #7).

Each wrapper takes a `RunContext[AgentDeps]` as its first parameter (Pydantic AI's dependency
injection) and otherwise mirrors the underlying tool function's signature exactly, using the
Pydantic models from `mcp/schemas.py` directly so Pydantic AI derives the tool's JSON Schema
from them - no hand-written schema.

get_table_structure, find_members, and get_data each raise a plain ValueError for a
business-rule failure (an unresolvable coordinate, a dimension that doesn't exist on the
table, a range query against a vectorless series, ...) - a mistake in the *arguments*, not a
WDS/transport failure. Pydantic AI only auto-retries on argument-validation errors; a ValueError
raised from inside a tool body otherwise propagates and crashes the whole run, giving the model
no chance to see the error and correct itself. Each wrapper here re-raises it as a ModelRetry
instead, which Pydantic AI feeds back to the model as a retry prompt - the same mechanism
already used for validation errors. WdsError (and its WdsMaintenanceWindow/WdsInvalidRequest
subclasses, from wds/client.py) is deliberately NOT caught here: those represent a WDS/transport
problem, not a model mistake, so retrying with different arguments wouldn't help.
"""

from __future__ import annotations

from collections.abc import Callable

from pydantic_ai import ModelRetry, RunContext

from ..mcp.schemas import DataResult, MemberCandidate, Period, TableCandidate, TableSearchFilters
from ..mcp.schemas import TableStructure as TableStructureModel
from ..mcp.tools.find_members import find_members as _find_members
from ..mcp.tools.get_data import get_data as _get_data
from ..mcp.tools.get_table_structure import get_table_structure as _get_table_structure
from ..mcp.tools.search_tables import search_tables as _search_tables
from .deps import AgentDeps


def _retry_on_value_error[T](call: Callable[[], T]) -> T:
    try:
        return call()
    except ValueError as exc:
        raise ModelRetry(str(exc)) from exc


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
    """Get a table's dimensions with their members, its frequency, and whether it's a Census
    table (no vector IDs, no date-range queries possible). Each dimension lists up to 30
    members, top-level first - usually enough to pick every member_id for get_data directly.
    Use find_members only when a dimension's member_count is larger than its list, or the
    phrase you need isn't obviously one of the listed members."""
    return _retry_on_value_error(lambda: _get_table_structure(ctx.deps.wds_client, product_id))


def find_members(
    ctx: RunContext[AgentDeps], product_id: int, dimension_position_id: int, query: str
) -> list[MemberCandidate]:
    """Resolve a phrase like "Ontario" or "25 to 34 years" to member IDs within one
    dimension of one table. Member meaning is table-specific - always scope this to the
    table you're actually querying."""
    return _retry_on_value_error(
        lambda: _find_members(ctx.deps.wds_client, product_id, dimension_position_id, query)
    )


def get_data(
    ctx: RunContext[AgentDeps],
    product_id: int,
    selections: dict[int, int | list[int]],
    period: Period,
) -> list[DataResult]:
    """Fetch actual data. `selections` maps each dimension's dimensionPositionId to a
    resolved memberId (from find_members or get_table_structure). Any dimension may instead
    map to a list of memberIds to fetch several series in one call: every combination of the
    listed members is fetched, at most 100 series - e.g. every province for "population by
    province", or every province x men and women for a comparison by sex. Ask for everything
    a question needs in one call rather than one call per member. Returns one DataResult per
    series. `period` is either {"type": "latestN", "n": <int>} or
    {"type": "range", "start": ..., "end": ...} (range queries require every resolved series
    to have a vector ID - no vector means no vector, which get_data will report as an error
    rather than approximating).

    This is the only tool that returns real values - never state a number in your answer
    without having called this.
    """
    return _retry_on_value_error(
        lambda: _get_data(ctx.deps.wds_client, product_id, selections, period)
    )
