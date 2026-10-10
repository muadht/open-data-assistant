"""`POST /chat`: runs the agent on one message and streams its events as defined in
docs/chat-api.md (the contract with the frontend's stream client, #14).

Every stream is `session`, then a `tool_call`/`tool_result` pair per tool the agent runs,
then exactly one terminal event: `answer`, `clarification`, `unanswerable` or `error`.
"""

from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import AsyncIterator
from typing import Any

import httpx
from pydantic import BaseModel, Field
from pydantic_ai import Agent, AgentRunResultEvent
from pydantic_ai.exceptions import UnexpectedModelBehavior, UsageLimitExceeded
from pydantic_ai.messages import (
    FunctionToolCallEvent,
    FunctionToolResultEvent,
    RetryPromptPart,
)
from pydantic_ai.usage import UsageLimits

from ..agent.deps import AgentDeps
from ..agent.outcomes import Answer, Clarification, Outcome, Unanswerable
from ..agent.related import related_tables
from ..agent.validator import fetched_data
from ..mcp.schemas import DataResult, MemberCandidate, TableSearchResult, TableStructure
from ..wds.client import WdsError, WdsMaintenanceWindow
from .sessions import Session

logger = logging.getLogger(__name__)

MAX_MESSAGE_LENGTH = 2000


class ChatRequest(BaseModel):
    session_id: str | None = None
    message: str = Field(min_length=1, max_length=MAX_MESSAGE_LENGTH)
    # Set by "Ask about this table" on the browse page (#56): answer from this table.
    table_id: int | None = Field(default=None, ge=1)


def pinned_table_instructions(table_id: int) -> str:
    """The run-level instruction for a table the user picked themselves - the agent-design
    "concept shortcut", chosen by the user instead of a lookup map."""
    return (
        f"The user has chosen table {table_id} (product_id) to ask about. Answer from this "
        "table: skip search_tables and start with get_table_structure for it. If the "
        "question can't be answered from this table, say so (Unanswerable) and suggest "
        "removing the table choice."
    )


def sse(event: str, data: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


async def chat_events(
    agent: Agent[AgentDeps, Outcome],
    deps: AgentDeps,
    session: Session,
    message: str,
    *,
    usage_limits: UsageLimits,
    timeout_seconds: float,
    table_id: int | None = None,
) -> AsyncIterator[str]:
    """The SSE stream for one message. Expects `session.lock` to be held by the caller and
    releases it when the stream ends, however it ends."""
    message_id = session.next_message_id()
    try:
        yield sse("session", {"session_id": session.id, "message_id": message_id})

        output: Outcome | None = None
        shown_calls: set[str] = set()
        try:
            async with asyncio.timeout(timeout_seconds):
                async with agent.run_stream_events(
                    message,
                    message_history=session.messages,
                    deps=deps,
                    usage_limits=usage_limits,
                    instructions=pinned_table_instructions(table_id) if table_id else None,
                ) as events:
                    async for event in events:
                        if isinstance(event, FunctionToolCallEvent):
                            shown_calls.add(event.tool_call_id)
                            label = tool_label(event.part.tool_name, event.part.args_as_dict())
                            yield sse(
                                "tool_call",
                                {
                                    "call_id": event.tool_call_id,
                                    "label": label,
                                    "tool": event.part.tool_name,
                                },
                            )
                        elif (
                            isinstance(event, FunctionToolResultEvent)
                            and event.tool_call_id in shown_calls
                        ):
                            yield sse("tool_result", tool_result(event))
                        elif isinstance(event, AgentRunResultEvent):
                            output = event.result.output
                            new_messages = event.result.new_messages()
                            all_messages = event.result.all_messages()
        except Exception as exc:  # noqa: BLE001 - every failure becomes an error event
            yield sse("error", {"message_id": message_id, **error_payload(exc, session)})
            return

        if output is None:
            yield sse(
                "error",
                {"message_id": message_id, **error_payload(RuntimeError("no output"), session)},
            )
            return
        # Only a completed run joins the history; a failed turn leaves it as it was.
        session.messages = all_messages
        yield sse(*terminal_event(output, message_id, all_messages, new_messages, deps))
    finally:
        session.lock.release()


def tool_label(tool_name: str, args: dict[str, Any]) -> str:
    """Plain-language progress for the user. The arguments are mostly IDs, so labels say
    what's happening rather than naming things the agent hasn't resolved yet."""
    if tool_name == "search_tables":
        query = str(args.get("query", "")).strip()
        return f'Searching StatCan tables for "{query}"' if query else "Searching StatCan tables"
    if tool_name == "get_table_structure":
        return "Reading the table's structure"
    if tool_name == "find_members":
        query = str(args.get("query", "")).strip()
        return f'Finding "{query}"' if query else "Finding the right categories"
    if tool_name == "get_data":
        selections = args.get("selections") or {}
        # Every combination of the listed members is a series (#88), e.g. 11 provinces x 2.
        count = 1
        for members in selections.values():
            if isinstance(members, list):
                count *= len(set(members))
        return f"Fetching data for {count} series" if count > 1 else "Fetching data"
    return f"Running {tool_name}"


def tool_result(event: FunctionToolResultEvent) -> dict[str, Any]:
    if isinstance(event.part, RetryPromptPart):
        # The tool rejected its arguments and the model will retry - progress, not an error.
        content = event.part.content
        message = content if isinstance(content, str) else "Invalid arguments"
        return {"call_id": event.tool_call_id, "ok": False, "message": message}
    payload: dict[str, Any] = {"call_id": event.tool_call_id, "ok": True}
    detail = tool_detail(event.part.tool_name, event.part.content)
    if detail:
        payload["detail"] = detail
    return payload


def tool_detail(tool_name: str, content: Any) -> str | None:
    """One line on what a tool found, from its own result - shown under the step while the
    agent works, so the user sees what it's looking at. Never fails a stream: anything
    unexpected just means no detail."""
    try:
        if tool_name == "search_tables" and isinstance(content, TableSearchResult):
            if not content.candidates:
                return "No matching tables"
            top = content.candidates[0]
            return f"Top match: {top.title_en} ({table_number(top.product_id)})"
        if tool_name == "get_table_structure" and isinstance(content, TableStructure):
            dimensions = ", ".join(d.name_en for d in content.dimensions)
            return f"{table_number(content.product_id)}: {dimensions}"
        if tool_name == "find_members" and isinstance(content, list):
            names = [m.name_en for m in content if isinstance(m, MemberCandidate)]
            return _first_few(names) if names else "No match"
        if tool_name == "get_data" and isinstance(content, list):
            results = [r for r in content if isinstance(r, DataResult)]
            return _data_detail(results) if results else None
    except Exception:  # noqa: BLE001 - a detail is a nicety, never worth breaking the stream
        logger.exception("No detail for %s", tool_name)
    return None


def table_number(product_id: int) -> str:
    """StatCan's displayed table number, e.g. 14100287 -> 14-10-0287-01."""
    s = str(product_id)
    return f"{s[:2]}-{s[2:4]}-{s[4:]}-01"


def _first_few(names: list[str], limit: int = 3) -> str:
    shown = ", ".join(names[:limit])
    return shown + (f" and {len(names) - limit} more" if len(names) > limit else "")


def _data_detail(results: list[DataResult]) -> str:
    """What was fetched: the members that differ between the series (e.g. "Newfoundland and
    Labrador ... British Columbia x Men+, Women+"), and the periods."""
    varying = [
        values
        for dimension in results[0].members
        if len(values := list(dict.fromkeys(r.members[dimension] for r in results))) > 1
    ]
    parts = [
        f"{values[0]} … {values[-1]}" if len(values) > 3 else ", ".join(values)
        for values in varying
    ]
    what = " × ".join(parts) if parts else results[0].series_title_en.split(";")[0]
    periods = sorted({p.ref_per for r in results for p in r.series})
    if not periods:
        return what
    span = periods[0][:7] if len(periods) == 1 else f"{periods[0][:7]} to {periods[-1][:7]}"
    return f"{what} · {span}"


def terminal_event(
    output: Outcome,
    message_id: str,
    all_messages: list[Any],
    new_messages: list[Any],
    deps: AgentDeps,
) -> tuple[str, dict[str, Any]]:
    if isinstance(output, Answer):
        # The values may come from data fetched in an earlier turn, so look across the
        # whole conversation (the validator does the same).
        fetched = fetched_data(all_messages)
        coordinates = list(dict.fromkeys(v.coordinate for v in output.values))
        results = [fetched[c] for c in coordinates if c in fetched]
        used_product_ids = list(dict.fromkeys(r.product_id for r in results))
        try:
            related = related_tables(new_messages, used_product_ids, deps)
        except Exception:  # noqa: BLE001 - suggestions are optional; never fail an answer
            logger.warning("Related tables unavailable", exc_info=True)
            related = []
        return "answer", {
            "message_id": message_id,
            "text": output.text,
            "values": [v.model_dump(mode="json") for v in output.values],
            "data_results": [r.model_dump(mode="json") for r in results],
            "related_tables": [t.model_dump(mode="json") for t in related],
        }
    if isinstance(output, Clarification):
        return "clarification", {"message_id": message_id, **output.model_dump(mode="json")}
    assert isinstance(output, Unanswerable)
    return "unanswerable", {"message_id": message_id, **output.model_dump(mode="json")}


def error_payload(exc: Exception, session: Session) -> dict[str, Any]:
    """Maps a failed run to the error codes in docs/chat-api.md. Messages are shown to the
    user as-is, so they never include exception text."""
    if isinstance(exc, WdsMaintenanceWindow):
        return _error(
            "wds_unavailable",
            "Statistics Canada's data service is updating (midnight to 8:30 AM ET). "
            "Try again shortly.",
        )
    if isinstance(exc, WdsError | httpx.HTTPError):
        logger.warning("WDS unavailable (session %s): %r", session.id, exc)
        return _error(
            "wds_unavailable",
            "Couldn't reach Statistics Canada's data service. Try again in a moment.",
        )
    if isinstance(exc, UnexpectedModelBehavior):
        logger.warning("Answer failed validation (session %s): %s", session.id, exc)
        return _error(
            "validation_failed",
            "I couldn't put together an answer that passes the source and accuracy checks. "
            "Try rephrasing the question.",
        )
    if isinstance(exc, UsageLimitExceeded):
        return _error(
            "limit_exceeded",
            "That question needed more steps than allowed. Try asking something more specific.",
            retryable=False,
        )
    if isinstance(exc, TimeoutError):
        return _error("timeout", "That took too long. Please try again.")
    logger.exception("Chat run failed (session %s)", session.id, exc_info=exc)
    return _error("internal", "Something went wrong on our side. Please try again.")


def _error(code: str, message: str, *, retryable: bool = True) -> dict[str, Any]:
    return {"code": code, "message": message, "retryable": retryable}
