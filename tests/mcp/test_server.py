"""Tests for the stdio MCP server wrapper (ticket #28), via the SDK's in-process client - the
server's own request handling and schema generation run for real; WDS is mocked at the httpx
transport, as everywhere else."""

from __future__ import annotations

import asyncio
from typing import Any

from mcp import Client
from mcp.types import CallToolResult, TextContent
from opensearchpy.exceptions import ConnectionError as OpenSearchConnectionError
from pytest_httpx import HTTPXMock

from open_data_assistant.agent.system_prompt import SYSTEM_PROMPT
from open_data_assistant.mcp.server import build_server
from open_data_assistant.search.hybrid import SearchClient
from open_data_assistant.wds.client import BASE_URL, WdsClient
from tests.fixtures.wds import load_wds_fixture
from tests.mcp.tools.test_search_tables import FakeEmbedder, FakeOpenSearchClient


def _call(
    wds_client: WdsClient,
    tool: str,
    arguments: dict[str, Any],
    search_client: SearchClient | None = None,
) -> CallToolResult:
    server = build_server(
        wds_client,
        search_client or FakeOpenSearchClient([]),
        "statcan-products",
        FakeEmbedder(),
    )

    async def run() -> CallToolResult:
        async with Client(server) as client:
            return await client.call_tool(tool, arguments)

    return asyncio.run(run())


def _error_text(result: CallToolResult) -> str:
    assert result.is_error
    [content] = result.content
    assert isinstance(content, TextContent)
    return content.text


def test_exposes_the_four_tools_with_their_contract_parameters() -> None:
    with WdsClient() as wds_client:
        server = build_server(
            wds_client, FakeOpenSearchClient([]), "statcan-products", FakeEmbedder()
        )

        async def run() -> dict[str, list[str]]:
            async with Client(server) as client:
                listed = await client.list_tools()
            return {t.name: sorted(t.input_schema["properties"]) for t in listed.tools}

        tools = asyncio.run(run())

    assert tools == {
        "search_tables": ["filters", "k", "query"],
        "get_table_structure": ["product_id"],
        "find_members": ["dimension_position_id", "product_id", "query"],
        "get_data": ["period", "product_id", "selections"],
    }


def test_sends_the_agent_system_prompt_as_server_instructions() -> None:
    with WdsClient() as wds_client:
        server = build_server(
            wds_client, FakeOpenSearchClient([]), "statcan-products", FakeEmbedder()
        )

        async def run() -> str | None:
            async with Client(server) as client:
                return client.instructions

        assert asyncio.run(run()) == SYSTEM_PROMPT


def test_successful_call_returns_structured_tool_output(httpx_mock: HTTPXMock) -> None:
    httpx_mock.add_response(
        method="POST",
        url=f"{BASE_URL}/getCubeMetadata",
        json=load_wds_fixture("cube_metadata")["body"],
    )

    with WdsClient() as wds_client:
        result = _call(
            wds_client,
            "find_members",
            {"product_id": 14100287, "dimension_position_id": 1, "query": "Ontario"},
        )

    assert not result.is_error
    assert result.structured_content is not None
    [member] = result.structured_content["result"]
    assert member["member_id"] == 7
    assert member["name_en"] == "Ontario"


def test_bad_argument_reaches_the_client_as_a_readable_tool_error(httpx_mock: HTTPXMock) -> None:
    httpx_mock.add_response(
        method="POST",
        url=f"{BASE_URL}/getCubeMetadata",
        json=load_wds_fixture("cube_metadata")["body"],
    )

    with WdsClient() as wds_client:
        result = _call(
            wds_client,
            "find_members",
            {"product_id": 14100287, "dimension_position_id": 99, "query": "Ontario"},
        )

    assert "dimension" in _error_text(result)


class _UnreachableOpenSearch:
    def search(self, *, index: str, body: dict[str, Any]) -> dict[str, Any]:
        raise OpenSearchConnectionError("N/A", "Connection refused", Exception())


def test_unreachable_opensearch_reaches_the_client_as_a_readable_tool_error() -> None:
    with WdsClient() as wds_client:
        result = _call(
            wds_client, "search_tables", {"query": "unemployment"}, _UnreachableOpenSearch()
        )

    assert "OpenSearch" in _error_text(result)


def test_maintenance_window_reaches_the_client_as_a_readable_tool_error(
    httpx_mock: HTTPXMock,
) -> None:
    httpx_mock.add_response(method="POST", url=f"{BASE_URL}/getCubeMetadata", status_code=409)

    with WdsClient() as wds_client:
        result = _call(wds_client, "get_table_structure", {"product_id": 14100287})

    assert "maintenance" in _error_text(result).lower()
