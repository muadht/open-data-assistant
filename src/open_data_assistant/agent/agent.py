"""Builds the Pydantic AI `Agent` that wires up all four MCP tools.

The model is intentionally left unset here - `docs/architecture-overview.md` deferred the
LLM provider choice (see ticket #9), and Pydantic AI supports passing/overriding `model` per
`run`/`run_sync` call rather than only at construction. The FastAPI layer (#11) and the
provider spike (#9) each supply whichever model they're testing/running against.
"""

from __future__ import annotations

from pydantic_ai import Agent
from pydantic_ai.models import KnownModelName, Model

from .deps import AgentDeps
from .system_prompt import SYSTEM_PROMPT
from .tools import find_members, get_data, get_table_structure, search_tables


def build_agent(model: Model | KnownModelName | str | None = None) -> Agent[AgentDeps, str]:
    agent: Agent[AgentDeps, str] = Agent(
        model,
        deps_type=AgentDeps,
        instructions=SYSTEM_PROMPT,
    )

    agent.tool(search_tables)
    agent.tool(get_table_structure)
    agent.tool(find_members)
    agent.tool(get_data)

    return agent


__all__ = ["AgentDeps", "build_agent"]
