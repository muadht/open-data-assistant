"""Dependencies the agent's tools need, injected via Pydantic AI's `RunContext` rather than
threaded through the LLM-facing tool signatures."""

from __future__ import annotations

from dataclasses import dataclass

from ..search.embeddings import EmbeddingProvider
from ..search.hybrid import SearchClient
from ..wds.client import WdsClient


@dataclass
class AgentDeps:
    wds_client: WdsClient
    search_client: SearchClient
    search_index: str
    embedder: EmbeddingProvider
