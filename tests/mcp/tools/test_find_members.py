"""Tests for the find_members MCP tool (ticket #4), against the fixtures from #1."""

from __future__ import annotations

import pytest
from pytest_httpx import HTTPXMock

from open_data_assistant.mcp.tools.find_members import find_members
from open_data_assistant.wds.client import BASE_URL, WdsClient
from tests.fixtures.wds import load_wds_fixture


def _mock_cube_metadata(httpx_mock: HTTPXMock) -> None:
    metadata = load_wds_fixture("cube_metadata")
    httpx_mock.add_response(
        method="POST", url=f"{BASE_URL}/getCubeMetadata", json=metadata["body"], status_code=200
    )


def test_exact_name_match(httpx_mock: HTTPXMock) -> None:
    _mock_cube_metadata(httpx_mock)

    with WdsClient() as client:
        candidates = find_members(client, 14100287, dimension_position_id=1, query="Ontario")

    assert len(candidates) == 1
    assert candidates[0].member_id == 7
    assert candidates[0].name_en == "Ontario"
    assert candidates[0].parent_member_id == 1
    assert candidates[0].terminated is False


def test_case_insensitive_partial_match(httpx_mock: HTTPXMock) -> None:
    _mock_cube_metadata(httpx_mock)

    with WdsClient() as client:
        candidates = find_members(client, 14100287, dimension_position_id=1, query="newfound")

    assert [c.name_en for c in candidates] == ["Newfoundland and Labrador"]


def test_no_matches_returns_empty_list_not_an_error(httpx_mock: HTTPXMock) -> None:
    _mock_cube_metadata(httpx_mock)

    with WdsClient() as client:
        candidates = find_members(client, 14100287, dimension_position_id=1, query="Atlantis")

    assert candidates == []


def test_match_is_scoped_to_the_named_dimension(httpx_mock: HTTPXMock) -> None:
    """The fixture's table only has one dimension with members attached, but the search
    must still be scoped by dimensionPositionId - a query against a position that doesn't
    exist on this table should fail loudly, not silently search a different dimension."""
    _mock_cube_metadata(httpx_mock)

    with WdsClient() as client, pytest.raises(ValueError, match="dimension"):
        find_members(client, 14100287, dimension_position_id=99, query="Ontario")
