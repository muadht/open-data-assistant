"""The three ways an agent run can end - see docs/agent-design.md "Typed outcomes".

These are the agent's `output_type`. Pydantic AI exposes each as an output tool whose
description is the model's docstring, so the docstrings below are written for the LLM: they
say *when* to pick each outcome. That guidance deliberately lives here and not in
`system_prompt.py`, which the MCP server also sends to clients (Claude Code etc.) that have no
output types and would find it confusing.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class UsedValue(BaseModel):
    """One number stated in the answer, traced to the data point it came from."""

    coordinate: str = Field(description="The `coordinate` of the DataResult this value is from.")
    ref_per: str = Field(description="The data point's `ref_per`, YYYY-MM-DD.")
    value: float | None = Field(
        description="The data point's `value` exactly as returned; None if it was suppressed."
    )


class Answer(BaseModel):
    """The question is answered with data you fetched via get_data. Only use this when you
    have called get_data and are stating its numbers; list every number you state in `values`.
    """

    text: str = Field(
        description=(
            "A short plain-language answer leading with the numbers and their reference "
            "period. Cite each series once, with a marker [n] after its first mention (n = "
            "the 1-based position in `values` of a value from that series). Name any quality "
            "flag or suppression on a value you use. No URLs "
            "or IDs: the app shows each series' source, flags and a chart beneath the answer."
        )
    )
    values: list[UsedValue] = Field(
        description=(
            "Every number stated in `text`, each traced to its data point. Citation "
            "markers refer to positions in this list: [1] is the first entry, and so on."
        )
    )


class Clarification(BaseModel):
    """You need the user to choose before you can fetch data, because the choice would change
    the answer and no sensible default settles it - e.g. two tables measure genuinely
    different things. Don't ask about choices a default covers (headline series, latest
    period); use the default and say so in the answer. Ask at most once per question.
    """

    question: str = Field(description="The question to put to the user, in plain language.")
    options: list[str] = Field(
        description=(
            "2-4 short choices in plain language, as the user should see them - no product "
            "IDs, vector IDs or table numbers."
        )
    )


class Unanswerable(BaseModel):
    """The question can't be answered from WDS as asked - e.g. no table matches, the data
    doesn't exist at that level, or a date range was asked of a series with no vector ID.
    """

    reason: str = Field(description="Why, in plain language.")
    alternative: str | None = Field(
        default=None,
        description="The nearest thing that *can* be answered, if there is one.",
    )


Outcome = Answer | Clarification | Unanswerable
