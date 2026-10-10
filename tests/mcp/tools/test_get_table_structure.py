"""Tests for the get_table_structure MCP tool (ticket #3), against the fixtures from #1."""

from __future__ import annotations

from pytest_httpx import HTTPXMock

from open_data_assistant.mcp.tools.get_table_structure import get_table_structure
from open_data_assistant.wds.client import BASE_URL, WdsClient
from tests.fixtures.wds import load_wds_fixture


def test_ordinary_table_is_not_a_census_table(httpx_mock: HTTPXMock) -> None:
    metadata = load_wds_fixture("cube_metadata")
    code_sets = load_wds_fixture("code_sets")
    httpx_mock.add_response(
        method="POST",
        url=f"{BASE_URL}/getCubeMetadata",
        json=metadata["body"],
        status_code=200,
    )
    httpx_mock.add_response(
        method="GET",
        url=f"{BASE_URL}/getCodeSets",
        json=code_sets["body"],
        status_code=200,
    )

    with WdsClient() as client:
        structure = get_table_structure(client, 14100287)

    assert structure.product_id == 14100287
    assert (
        structure.title_en
        == "Labour force characteristics, monthly, seasonally adjusted and trend-cycle"
    )
    assert structure.is_census_table is False
    assert structure.frequency == "Monthly"
    geography = next(d for d in structure.dimensions if d.name_en == "Geography")
    assert geography.dimension_position_id == 1
    assert geography.has_uom is False


def test_census_table_is_flagged_from_product_id_prefix_not_wds(httpx_mock: HTTPXMock) -> None:
    """is_census_table must come from the productId prefix, not anything WDS returns - so
    this test deliberately reuses the non-Census cube_metadata fixture under a 9810-series
    product_id, to prove the flag isn't accidentally derived from the metadata content."""
    metadata = load_wds_fixture("cube_metadata")
    metadata["body"][0]["object"]["productId"] = "98100001"
    code_sets = load_wds_fixture("code_sets")
    httpx_mock.add_response(
        method="POST", url=f"{BASE_URL}/getCubeMetadata", json=metadata["body"], status_code=200
    )
    httpx_mock.add_response(
        method="GET", url=f"{BASE_URL}/getCodeSets", json=code_sets["body"], status_code=200
    )

    with WdsClient() as client:
        structure = get_table_structure(client, 98100001)

    assert structure.is_census_table is True
