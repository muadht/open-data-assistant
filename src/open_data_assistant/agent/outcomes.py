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
            "The plain-language answer, following the trust rules: reference period stated, "
            "a markdown link to each series' series_url (or source_url if it has none), and "
            "any quality flag or suppression named explicitly."
        )
    )
    values: list[UsedValue] = Field(
        description="Every number stated in `text`, each traced to its data point."
    )


class Clarification(BaseModel):
    """You need the user to choose before you can fetch data - e.g. more than one table could
    plausibly answer the question, or a phrase matches several members. Don't guess; ask.
    """

    question: str = Field(description="The question to put to the user, in plain language.")
    options: list[str] = Field(
        description="The choices, worded as the user should see them (e.g. table titles)."
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
