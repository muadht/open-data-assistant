"""Tests for the get_data MCP tool (ticket #5), against the fixtures from #1. Cross-checks
expected values against docs/question-catalogue-eval.xlsx rows 1 (normal), 5 (range), and 9
(scalar factor) - see each fixture's description for exactly which row it matches.
"""

from __future__ import annotations

import pytest
from pytest_httpx import HTTPXMock

from open_data_assistant.mcp.schemas import LatestNPeriod, RangePeriod
from open_data_assistant.mcp.tools.get_data import get_data
from open_data_assistant.wds.client import BASE_URL, WdsClient
from tests.fixtures.wds import load_wds_fixture


def _mock(httpx_mock: HTTPXMock, method: str, path: str, fixture_name: str, url: str = "") -> None:
    fixture = load_wds_fixture(fixture_name)
    httpx_mock.add_response(
        method=method,
        url=url or f"{BASE_URL}/{path}",
        json=fixture["body"],
        status_code=fixture["http_status"],
    )


def test_normal_latest_n_fetch(httpx_mock: HTTPXMock) -> None:
    _mock(httpx_mock, "POST", "getCubeMetadata", "cube_metadata")
    _mock(httpx_mock, "POST", "getSeriesInfoFromCubePidCoord", "normal_series_info")
    _mock(httpx_mock, "POST", "getDataFromVectorsAndLatestNPeriods", "normal_data_point")
    _mock(httpx_mock, "GET", "getCodeSets", "code_sets")

    selections = {1: 7, 2: 7, 3: 1, 4: 1, 5: 1, 6: 1}
    with WdsClient() as client:
        result = get_data(client, 14100287, selections, LatestNPeriod(n=1))

    assert result.product_id == 14100287
    assert (
        result.title_en
        == "Labour force characteristics, monthly, seasonally adjusted and trend-cycle"
    )
    assert result.coordinate == "7.7.1.1.1.1.0.0.0.0"
    assert result.vector_id == 2063949
    assert len(result.series) == 1
    point = result.series[0]
    assert point.ref_per == "2026-08-01"
    assert point.value == 6.9
    assert point.uom == "Percent"
    assert point.scalar_factor_applied is True
    assert point.status == "normal"
    assert point.symbol is None
    assert point.security_level == "public"
    assert point.decimals == 1
    assert point.release_time == "2026-09-04T08:30"
    assert result.series_title_en == (
        "Ontario;Unemployment rate;Total - Gender;15 years and over;Estimate;Seasonally adjusted"
    )
    assert result.members == {
        "Geography": "Ontario",
        "Labour force characteristics": "Unemployment rate",
        "Gender": "Total - Gender",
        "Age group": "15 years and over",
        "Statistics": "Estimate",
        "Data type": "Seasonally adjusted",
    }
    assert (
        str(result.source_url) == "https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=1410028701"
    )
    assert str(result.series_url) == (
        "https://www150.statcan.gc.ca/t1/tbl1/en/sbv.action"
        "?vectorNumbers=v2063949&searchOption=2&latestN=1"
    )


def test_range_fetch_requires_a_vector_id(httpx_mock: HTTPXMock) -> None:
    _mock(httpx_mock, "POST", "getCubeMetadata", "cube_metadata")
    _mock(httpx_mock, "POST", "getSeriesInfoFromCubePidCoord", "normal_series_info")
    _mock(httpx_mock, "GET", "getCodeSets", "code_sets")
    _mock(
        httpx_mock,
        "GET",
        "",
        "range_data_point",
        url=(
            f"{BASE_URL}/getDataFromVectorByReferencePeriodRange"
            "?vectorIds=2063949&startRefPeriod=2019-01-01&endReferencePeriod=2024-01-01"
        ),
    )

    selections = {1: 7, 2: 7, 3: 1, 4: 1, 5: 1, 6: 1}
    period = RangePeriod(start="2019-01-01", end="2024-01-01")
    with WdsClient() as client:
        result = get_data(client, 14100287, selections, period)

    assert len(result.series) == 61
    assert result.series[0].ref_per == "2019-01-01"
    assert result.series[0].value == 5.6
    assert result.series[-1].ref_per == "2024-01-01"
    assert result.series[-1].value == 6.1
    assert str(result.series_url) == (
        "https://www150.statcan.gc.ca/t1/tbl1/en/sbv.action?vectorNumbers=v2063949&searchOption=2"
    )


def test_census_table_latest_n_fetch_has_no_vector_id(httpx_mock: HTTPXMock) -> None:
    _mock(httpx_mock, "POST", "getCubeMetadata", "census_cube_metadata")
    _mock(httpx_mock, "POST", "getSeriesInfoFromCubePidCoord", "census_series_info")
    _mock(httpx_mock, "POST", "getDataFromCubePidCoordAndLatestNPeriods", "census_data_point")
    _mock(httpx_mock, "GET", "getCodeSets", "code_sets")

    selections = {1: 7, 2: 1}
    with WdsClient() as client:
        result = get_data(client, 98100001, selections, LatestNPeriod(n=1))

    assert result.vector_id is None
    assert result.series_url is None
    assert result.coordinate == "7.1.0.0.0.0.0.0.0.0"
    assert result.series[0].value == 14223942.0


def test_footnotes_are_only_those_for_the_table_its_dimensions_and_the_selected_members(
    httpx_mock: HTTPXMock,
) -> None:
    """Table 14100287 has 20 footnotes. For Ontario / unemployment rate / estimate /
    seasonally adjusted, 7 apply: 3 table-level, 3 dimension-level (Geography, Gender x2),
    and the unemployment-rate definition. Footnotes on other members (e.g. the trend-cycle
    data type, the population characteristic) don't."""
    _mock(httpx_mock, "POST", "getCubeMetadata", "cube_metadata")
    _mock(httpx_mock, "POST", "getSeriesInfoFromCubePidCoord", "normal_series_info")
    _mock(httpx_mock, "POST", "getDataFromVectorsAndLatestNPeriods", "normal_data_point")
    _mock(httpx_mock, "GET", "getCodeSets", "code_sets")

    selections = {1: 7, 2: 7, 3: 1, 4: 1, 5: 1, 6: 1}
    with WdsClient() as client:
        result = get_data(client, 14100287, selections, LatestNPeriod(n=1))

    assert len(result.footnotes) == 7
    assert any(f.startswith("The unemployment rate is the number") for f in result.footnotes)
    assert any(f == "Excluding the territories." for f in result.footnotes)
    assert not any("smoothed version" in f for f in result.footnotes)
    assert not any(f.startswith("Number of persons of working age") for f in result.footnotes)


def test_census_footnotes_are_deduplicated_and_stripped_of_html(httpx_mock: HTTPXMock) -> None:
    """WDS repeats footnote 2 once per linked member and footnote 1 is HTML (see the
    census_cube_metadata fixture's description)."""
    _mock(httpx_mock, "POST", "getCubeMetadata", "census_cube_metadata")
    _mock(httpx_mock, "POST", "getSeriesInfoFromCubePidCoord", "census_series_info")
    _mock(httpx_mock, "POST", "getDataFromCubePidCoordAndLatestNPeriods", "census_data_point")
    _mock(httpx_mock, "GET", "getCodeSets", "code_sets")

    selections = {1: 7, 2: 1}
    with WdsClient() as client:
        result = get_data(client, 98100001, selections, LatestNPeriod(n=1))

    assert result.members == {
        "Geographic name": "Ontario",
        "Population and dwelling counts (11)": "Population, 2021",
    }
    assert len(result.footnotes) == 2
    assert result.footnotes[0].startswith("Content considerations The 2021 Census population")
    assert "<" not in result.footnotes[0]
    assert result.footnotes[1].startswith("Excludes census data for one or more incompletely")


def test_census_table_range_fetch_raises_a_clear_error(httpx_mock: HTTPXMock) -> None:
    _mock(httpx_mock, "POST", "getCubeMetadata", "census_cube_metadata")
    _mock(httpx_mock, "POST", "getSeriesInfoFromCubePidCoord", "census_series_info")

    selections = {1: 7, 2: 1}
    period = RangePeriod(start="2016-01-01", end="2021-01-01")
    with WdsClient() as client, pytest.raises(ValueError, match="Census table"):
        get_data(client, 98100001, selections, period)


def test_nonexistent_coordinate_raises_a_clear_error(httpx_mock: HTTPXMock) -> None:
    _mock(httpx_mock, "POST", "getCubeMetadata", "cube_metadata")
    _mock(httpx_mock, "POST", "getSeriesInfoFromCubePidCoord", "nonexistent_coordinate")

    selections = {1: 99, 2: 7, 3: 1, 4: 1, 5: 1, 6: 1}
    with WdsClient() as client, pytest.raises(ValueError, match="No series exists"):
        get_data(client, 14100287, selections, LatestNPeriod(n=1))


def test_scalar_factor_is_applied(httpx_mock: HTTPXMock) -> None:
    """GDP: raw value 3437720 with scalarFactorCode 6 (millions) -> ~$3.44 trillion, not
    3,437,720. Matches question-catalogue-eval.xlsx row 9."""
    _mock(httpx_mock, "POST", "getCubeMetadata", "gdp_cube_metadata")
    _mock(httpx_mock, "POST", "getSeriesInfoFromCubePidCoord", "gdp_series_info")
    _mock(httpx_mock, "POST", "getDataFromVectorsAndLatestNPeriods", "gdp_data_point")
    _mock(httpx_mock, "GET", "getCodeSets", "code_sets")

    selections = {1: 1, 2: 2, 3: 1, 4: 30}
    with WdsClient() as client:
        result = get_data(client, 36100104, selections, LatestNPeriod(n=1))

    point = result.series[0]
    assert point.ref_per == "2026-04-01"
    assert point.value == 3437720.0 * 10**6
    assert point.uom == "Dollars"
    assert point.scalar_factor_applied is True
    assert result.footnotes == []
    assert result.members["Prices"] == "Current prices"


def test_suppressed_value_is_kept_in_series_with_a_null_value(httpx_mock: HTTPXMock) -> None:
    _mock(httpx_mock, "POST", "getCubeMetadata", "suppressed_cube_metadata")
    _mock(httpx_mock, "POST", "getSeriesInfoFromCubePidCoord", "suppressed_series_info")
    _mock(httpx_mock, "POST", "getDataFromVectorsAndLatestNPeriods", "suppressed_value")
    _mock(httpx_mock, "GET", "getCodeSets", "code_sets")

    selections = {1: 1, 2: 1, 3: 1, 4: 1}
    with WdsClient() as client:
        result = get_data(client, 13100778, selections, LatestNPeriod(n=1))

    assert len(result.series) == 1
    point = result.series[0]
    assert point.value is None
    assert point.status == "too unreliable to be published"
