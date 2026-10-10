"""Tests for the get_table_structure MCP tool (ticket #3), against the fixtures from #1."""

from __future__ import annotations

from typing import Any

from pytest_httpx import HTTPXMock

from open_data_assistant.mcp.tools.get_table_structure import (
    MAX_MEMBERS_LISTED,
    get_table_structure,
)
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


def _mock_structure(httpx_mock: HTTPXMock, metadata_body: list[Any]) -> None:
    httpx_mock.add_response(
        method="POST", url=f"{BASE_URL}/getCubeMetadata", json=metadata_body, status_code=200
    )
    httpx_mock.add_response(
        method="GET",
        url=f"{BASE_URL}/getCodeSets",
        json=load_wds_fixture("code_sets")["body"],
        status_code=200,
    )


def test_dimensions_list_their_members(httpx_mock: HTTPXMock) -> None:
    """The model picks member_ids straight from the structure instead of guessing names
    with find_members - e.g. this table's gender total is "Total - Gender", not "Both
    sexes" (#61)."""
    _mock_structure(httpx_mock, load_wds_fixture("cube_metadata")["body"])

    with WdsClient() as client:
        structure = get_table_structure(client, 14100287)

    by_name = {d.name_en: d for d in structure.dimensions}
    gender = by_name["Gender"]
    assert [(m.member_id, m.name_en) for m in gender.members] == [
        (1, "Total - Gender"),
        (2, "Men+"),
        (3, "Women+"),
    ]
    assert gender.member_count == 3
    geography = by_name["Geography"]
    assert geography.member_count == 11
    assert len(geography.members) == 11  # under the cap: the full list
    assert any(m.name_en == "Ontario" for m in geography.members)


def test_large_dimensions_are_capped_top_level_first(httpx_mock: HTTPXMock) -> None:
    """A dimension over the cap lists its top levels first (totals, then their children)
    and reports the full count, so the model knows to use find_members for the rest."""
    body = load_wds_fixture("cube_metadata")["body"]
    members = [{"memberId": 1, "memberNameEn": "Canada", "parentMemberId": None}]
    members += [
        {"memberId": 1 + p, "memberNameEn": f"Province {p}", "parentMemberId": 1}
        for p in range(1, 11)
    ]
    # Grandchildren listed *before* their parents in WDS's order, to show sorting by depth.
    cities = [
        {"memberId": 100 + c, "memberNameEn": f"City {c}", "parentMemberId": 2}
        for c in range(1, MAX_MEMBERS_LISTED + 10)
    ]
    body[0]["object"]["dimension"][0]["member"] = cities + members
    _mock_structure(httpx_mock, body)

    with WdsClient() as client:
        structure = get_table_structure(client, 14100287)

    geography = structure.dimensions[0]
    assert geography.member_count == 11 + MAX_MEMBERS_LISTED + 9
    assert len(geography.members) == MAX_MEMBERS_LISTED
    assert geography.members[0].name_en == "Canada"
    assert [m.name_en for m in geography.members[1:11]] == [f"Province {p}" for p in range(1, 11)]
    assert geography.members[11].name_en == "City 1"
