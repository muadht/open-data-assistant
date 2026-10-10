"""Output validation of the trust rules - see docs/agent-design.md "Output validator".

The system prompt *asks* the model to follow the rules in docs/mvp-scope.md; this is what
*guarantees* them. Each failed check becomes a ModelRetry naming the exact problem, so the
model can fix the answer rather than the run returning an unchecked one.

Only the structured `Answer.values` are checked against fetched data (not numbers in the
free text) - the ticket's agreed starting point; see #48 for when to revisit that.

Trust rule 1 (cite the source) isn't checked in the text: every value must trace to a fetched
DataResult (rule 5, below), and the chat endpoint sends those DataResults with the answer, so
the app always shows each series' source beneath it (AGENT_SYSTEM_PROMPT, rule 1). URLs in the
text are rejected rather than tolerated, so answers stay clean whatever the prompt does.
"""

from __future__ import annotations

import re
from typing import Any

from pydantic_ai import ModelRetry, RunContext
from pydantic_ai.messages import ModelMessage, ModelRequest, ToolReturnPart

from ..mcp.schemas import DataPoint, DataResult
from .deps import AgentDeps
from .outcomes import Answer, Outcome

_URL = re.compile(r"https?://", re.IGNORECASE)
_MARKER = re.compile(r"\[(\d+)\]")


def validate_outcome(ctx: RunContext[AgentDeps], outcome: Outcome) -> Outcome:
    if isinstance(outcome, Answer):
        _validate_answer(outcome, fetched_data(ctx.messages))
    return outcome


def _validate_answer(answer: Answer, fetched: dict[str, DataResult]) -> None:
    if not answer.values:
        raise ModelRetry(
            "An Answer must state at least one value fetched with get_data. If you have no "
            "data to report, return Unanswerable or Clarification instead."
        )

    problems: list[str] = []
    if _URL.search(answer.text):
        problems.append(
            "Remove the URLs from the answer text: the app shows each series' source link "
            "beneath the answer."
        )
    problems.extend(_citation_problems(answer))
    for used in answer.values:
        result = fetched.get(used.coordinate)
        point = _point(result, used.ref_per) if result else None
        if result is None or point is None or point.value != used.value:
            problems.append(
                f"{used.value} for coordinate {used.coordinate} at {used.ref_per} does not "
                "appear in any fetched data - only state numbers get_data returned."
            )
            continue

        year = used.ref_per[:4]
        if year not in answer.text:
            problems.append(
                f"The answer must say what period {used.value} is for (reference period "
                f"{used.ref_per})."
            )

        for flag in _flags(point):
            if flag.lower() not in answer.text.lower():
                problems.append(
                    f"The data point for {used.ref_per} is flagged '{flag}' - the answer "
                    "must say so explicitly."
                )

    if problems:
        raise ModelRetry("\n".join(problems))


def _flags(point: DataPoint) -> list[str]:
    flags = []
    if point.status != "normal":
        flags.append(point.status)
    if point.symbol is not None:
        flags.append(point.symbol)
    if point.security_level != "public":
        flags.append(point.security_level)
    return flags


def _point(result: DataResult, ref_per: str) -> DataPoint | None:
    return next((p for p in result.series if p.ref_per == ref_per), None)


def fetched_data(messages: list[ModelMessage]) -> dict[str, DataResult]:
    """Every DataResult returned by get_data so far in the conversation, keyed by coordinate
    - earlier turns included, so a follow-up may reuse data it already fetched."""
    fetched: dict[str, DataResult] = {}
    for message in messages:
        if not isinstance(message, ModelRequest):
            continue
        for part in message.parts:
            if isinstance(part, ToolReturnPart) and part.tool_name == "get_data":
                for result in _as_results(part.content):
                    fetched[result.coordinate] = result
    return fetched


def _as_results(content: Any) -> list[DataResult]:
    # In-process the content is the list[DataResult] the tool returned; a message history
    # that was serialized and reloaded (e.g. by the chat endpoint) carries plain dicts.
    if not isinstance(content, list):
        return []
    return [r if isinstance(r, DataResult) else DataResult.model_validate(r) for r in content]


def _citation_problems(answer: Answer) -> list[str]:
    """Each number in the text is followed by a marker [n] pointing at its entry in
    `values` (1-based); the app turns markers into links to the sources (#63)."""
    cited = {int(n) for n in _MARKER.findall(answer.text)}
    count = len(answer.values)
    problems = [
        f"Citation marker [{n}] doesn't match any value - there are {count} in `values`."
        for n in sorted(cited)
        if not 1 <= n <= count
    ]
    uncited = [str(i) for i in range(1, count + 1) if i not in cited]
    if uncited:
        problems.append(
            "Cite every value with its marker right after the number in the text - "
            f"missing: {', '.join(f'[{n}]' for n in uncited)}."
        )
    return problems

