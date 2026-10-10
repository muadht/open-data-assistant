"""Builds the Pydantic AI `Agent` that wires up all four MCP tools.

The model is intentionally left unset here - `docs/architecture-overview.md` deferred the
LLM provider choice (see ticket #9), and Pydantic AI supports passing/overriding `model` per
`run`/`run_sync` call rather than only at construction. The FastAPI layer (#11) and the
provider spike (#9) each supply whichever model they're testing/running against.

Every run ends in a typed `Outcome` checked by `validator.py` (docs/agent-design.md). The
agent is stateless: the caller passes `message_history` in and keeps what comes back, and
applies `DEFAULT_USAGE_LIMITS` and `DEFAULT_RUN_TIMEOUT_SECONDS` itself - Pydantic AI has no
run-level timeout, so that's an `asyncio.timeout` around `run()` on the caller's side.
"""

from __future__ import annotations

from pydantic_ai import Agent
from pydantic_ai.models import KnownModelName, Model
from pydantic_ai.usage import UsageLimits

from .deps import AgentDeps
from .outcomes import Answer, Clarification, Outcome, Unanswerable
from .system_prompt import APP_INSTRUCTIONS, SYSTEM_PROMPT
from .tools import find_members, get_data, get_table_structure, search_tables
from .validator import validate_outcome

# A typical question takes 4-6 tool calls (search, structure, members, data); 12 leaves room
# for a comparison or a retry without letting a confused run spin. Tune from #10's data.
DEFAULT_USAGE_LIMITS = UsageLimits(request_limit=12, tool_calls_limit=12)
DEFAULT_RUN_TIMEOUT_SECONDS = 30.0

# How many times a failed output validation is sent back to the model before the run fails
# visibly (UnexpectedModelBehavior) rather than returning an unchecked answer.
_OUTPUT_RETRIES = 2


def build_agent(model: Model | KnownModelName | str | None = None) -> Agent[AgentDeps, Outcome]:
    agent: Agent[AgentDeps, Outcome] = Agent(
        model,
        deps_type=AgentDeps,
        # The list form rather than the `Outcome` alias: mypy can't match a runtime union
        # object to Agent's output_type overloads, but types the list against the annotation.
        output_type=[Answer, Clarification, Unanswerable],
        instructions=[SYSTEM_PROMPT, APP_INSTRUCTIONS],
        retries=_OUTPUT_RETRIES,
    )

    agent.tool(search_tables)
    agent.tool(get_table_structure)
    agent.tool(find_members)
    agent.tool(get_data)
    agent.output_validator(validate_outcome)

    return agent


__all__ = [
    "DEFAULT_RUN_TIMEOUT_SECONDS",
    "DEFAULT_USAGE_LIMITS",
    "AgentDeps",
    "Answer",
    "Clarification",
    "Outcome",
    "Unanswerable",
    "build_agent",
]
