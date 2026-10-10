"""Related tables for an answer (#54): other tables that may interest the user, shown under
the answer. Metadata only - never data values - so no trust-rule checks apply.

The agent's own `search_tables` results are the best source: they're ranked for this
question and cost nothing extra. A follow-up question often skips searching, so then the
fallback is tables similar to the one the answer used.
"""

from __future__ import annotations

from typing import Any

from pydantic_ai.messages import ModelMessage, ModelRequest, ToolReturnPart

from ..mcp.schemas import TableCandidate, TableSearchResult
from ..mcp.tools.search_tables import similar_tables
from .deps import AgentDeps

RELATED_TABLES_LIMIT = 5


def related_tables(
    run_messages: list[ModelMessage],
    used_product_ids: list[int],
    deps: AgentDeps,
    *,
    limit: int = RELATED_TABLES_LIMIT,
) -> list[TableCandidate]:
    """`run_messages` should be this run's messages only (`result.new_messages()`), so the
    suggestions come from this question's search, not an earlier turn's."""
    used = set(used_product_ids)
    seen: set[int] = set(used)
    related: list[TableCandidate] = []
    for candidate in _searched_candidates(run_messages):
        if candidate.product_id not in seen:
            seen.add(candidate.product_id)
            related.append(candidate)
    if related or not used_product_ids:
        return related[:limit]

    return [
        candidate
        for candidate in similar_tables(
            deps.search_client, deps.search_index, used_product_ids[0], k=limit + len(used)
        )
        if candidate.product_id not in used
    ][:limit]


def _searched_candidates(messages: list[ModelMessage]) -> list[TableCandidate]:
    candidates: list[TableCandidate] = []
    for message in messages:
        if not isinstance(message, ModelRequest):
            continue
        for part in message.parts:
            if isinstance(part, ToolReturnPart) and part.tool_name == "search_tables":
                candidates.extend(_as_candidates(part.content))
    return candidates


def _as_candidates(content: Any) -> list[TableCandidate]:
    # In-process the content is the TableSearchResult the tool returned; a serialized and
    # reloaded message history carries plain dicts. Before #90 the tool returned a bare list,
    # which an older session's history may still hold.
    if isinstance(content, TableSearchResult):
        return content.candidates
    if isinstance(content, dict):
        content = content.get("candidates")
    if not isinstance(content, list):
        return []
    return [
        c if isinstance(c, TableCandidate) else TableCandidate.model_validate(c) for c in content
    ]
