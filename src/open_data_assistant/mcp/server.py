"""The four tools exposed as a stdio MCP server, for calling them directly from an MCP client
(VS Code agent mode, MCP Inspector) during development - see ticket #28.

This is a second thin wrapper over the same functions in `mcp/tools/`, alongside the
in-process one in `agent/tools.py`. The production agent does not go through this server.
Tool descriptions are taken from the agent's wrappers so both expose identical LLM-facing text.

`mcp` SDK v2 hides an unexpected exception's message from the client (it only reports "Error
executing tool X"). Our ValueError (a bad argument) and WdsError (WDS unavailable/rejected) are
expected failures whose message is the useful part, so they're re-raised as ToolError.
"""

from __future__ import annotations

import logging
from collections.abc import Callable

from mcp.server.mcpserver import MCPServer
from mcp.server.mcpserver.exceptions import ToolError
from opensearchpy.exceptions import ConnectionError as OpenSearchConnectionError

from ..agent import tools as agent_tools
from ..search.config import EmbeddingConfig, OpenSearchConfig
from ..search.embeddings import EmbeddingProvider, SentenceTransformerEmbedder
from ..search.hybrid import SearchClient
from ..search.pipeline import make_client
from ..wds.client import WdsClient, WdsError
from .schemas import DataResult, MemberCandidate, Period, TableCandidate, TableSearchFilters
from .schemas import TableStructure as TableStructureModel
from .tools.find_members import find_members as _find_members
from .tools.get_data import get_data as _get_data
from .tools.get_table_structure import get_table_structure as _get_table_structure
from .tools.search_tables import search_tables as _search_tables


def _as_tool_error[T](call: Callable[[], T]) -> T:
    try:
        return call()
    except (ValueError, WdsError) as exc:
        raise ToolError(str(exc)) from exc


def build_server(
    wds_client: WdsClient,
    search_client: SearchClient,
    search_index: str,
    embedder: EmbeddingProvider,
) -> MCPServer:
    server = MCPServer("open-data-assistant")

    @server.tool(description=agent_tools.search_tables.__doc__)
    def search_tables(
        query: str, filters: TableSearchFilters | None = None, k: int = 10
    ) -> list[TableCandidate]:
        try:
            return _as_tool_error(
                lambda: _search_tables(search_client, search_index, embedder, query, filters, k=k)
            )
        except OpenSearchConnectionError as exc:
            raise ToolError(
                "Can't reach OpenSearch - search_tables needs a running OpenSearch with the "
                "catalogue index built (see README). The other three tools only need WDS."
            ) from exc

    @server.tool(description=agent_tools.get_table_structure.__doc__)
    def get_table_structure(product_id: int) -> TableStructureModel:
        return _as_tool_error(lambda: _get_table_structure(wds_client, product_id))

    @server.tool(description=agent_tools.find_members.__doc__)
    def find_members(
        product_id: int, dimension_position_id: int, query: str
    ) -> list[MemberCandidate]:
        return _as_tool_error(
            lambda: _find_members(wds_client, product_id, dimension_position_id, query)
        )

    @server.tool(description=agent_tools.get_data.__doc__)
    def get_data(product_id: int, selections: dict[int, int], period: Period) -> DataResult:
        return _as_tool_error(lambda: _get_data(wds_client, product_id, selections, period))

    return server


def main() -> None:
    # stdout is the stdio transport's protocol channel - logs must go to stderr only.
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    for noisy_logger in ("httpx", "httpcore", "huggingface_hub", "urllib3", "opensearch"):
        logging.getLogger(noisy_logger).setLevel(logging.WARNING)

    opensearch_config = OpenSearchConfig.from_env()
    with WdsClient() as wds_client:
        server = build_server(
            wds_client=wds_client,
            search_client=make_client(opensearch_config),
            search_index=opensearch_config.index_name,
            embedder=SentenceTransformerEmbedder(EmbeddingConfig.from_env()),
        )
        server.run("stdio")
