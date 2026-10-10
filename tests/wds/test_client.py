"""Tests for the general-purpose WDS client (ticket #2), against the fixtures recorded in
ticket #1. Zero live calls - pytest-httpx mocks the httpx transport, per CLAUDE.md's
"no live WDS calls in tests" rule.
"""

from __future__ import annotations

import pytest
from pytest_httpx import HTTPXMock

from open_data_assistant.wds.client import (
    BASE_URL,
    WdsClient,
    WdsInvalidRequest,
    WdsMaintenanceWindow,
)
from tests.fixtures.wds import load_wds_fixture


def test_get_data_from_vectors_and_latest_n_periods_normal(httpx_mock: HTTPXMock) -> None:
    fixture = load_wds_fixture("normal_data_point")
    httpx_mock.add_response(
        method="POST",
        url=f"{BASE_URL}/getDataFromVectorsAndLatestNPeriods",
        json=fixture["body"],
        status_code=fixture["http_status"],
    )

    with WdsClient() as client:
        result = client.get_data_from_vectors_and_latest_n_periods([(2063949, 1)])

    assert result[0]["object"]["vectorDataPoint"][0]["value"] == 6.9


def test_maintenance_window_raises_distinct_exception(httpx_mock: HTTPXMock) -> None:
    httpx_mock.add_response(
        method="POST",
        url=f"{BASE_URL}/getDataFromVectorsAndLatestNPeriods",
        status_code=409,
    )

    with WdsClient() as client, pytest.raises(WdsMaintenanceWindow):
        client.get_data_from_vectors_and_latest_n_periods([(2063949, 1)])


def test_malformed_coordinate_raises_distinct_exception(httpx_mock: HTTPXMock) -> None:
    fixture = load_wds_fixture("malformed_coordinate_406")
    httpx_mock.add_response(
        method="POST",
        url=f"{BASE_URL}/getSeriesInfoFromCubePidCoord",
        json=fixture["body"],
        status_code=406,
    )

    with WdsClient() as client, pytest.raises(WdsInvalidRequest) as exc_info:
        client.get_series_info_from_cube_pid_coord([(14100287, "7.7.1.1.1")])
    assert "co-ordinate" in str(exc_info.value)


def test_vector_zero_raises_distinct_exception(httpx_mock: HTTPXMock) -> None:
    fixture = load_wds_fixture("vector_zero_406")
    httpx_mock.add_response(
        method="POST",
        url=f"{BASE_URL}/getDataFromVectorsAndLatestNPeriods",
        json=fixture["body"],
        status_code=406,
    )

    with WdsClient() as client, pytest.raises(WdsInvalidRequest) as exc_info:
        client.get_data_from_vectors_and_latest_n_periods([(0, 1)])
    assert "vector id or latest N" in str(exc_info.value)


def test_406_is_not_retried(httpx_mock: HTTPXMock) -> None:
    """Only one request should go out - a 406 is a real error, not something to retry."""
    fixture = load_wds_fixture("vector_zero_406")
    httpx_mock.add_response(
        method="POST",
        url=f"{BASE_URL}/getDataFromVectorsAndLatestNPeriods",
        json=fixture["body"],
        status_code=406,
    )

    with WdsClient() as client, pytest.raises(WdsInvalidRequest):
        client.get_data_from_vectors_and_latest_n_periods([(0, 1)])

    assert len(httpx_mock.get_requests()) == 1


def test_5xx_is_retried_then_succeeds(httpx_mock: HTTPXMock) -> None:
    fixture = load_wds_fixture("normal_data_point")
    httpx_mock.add_response(
        method="POST", url=f"{BASE_URL}/getDataFromVectorsAndLatestNPeriods", status_code=500
    )
    httpx_mock.add_response(
        method="POST",
        url=f"{BASE_URL}/getDataFromVectorsAndLatestNPeriods",
        json=fixture["body"],
        status_code=200,
    )

    with WdsClient(retry_backoff_seconds=0.01) as client:
        result = client.get_data_from_vectors_and_latest_n_periods([(2063949, 1)])

    assert result[0]["object"]["vectorDataPoint"][0]["value"] == 6.9
    assert len(httpx_mock.get_requests()) == 2


def test_5xx_exhausts_retries_and_raises(httpx_mock: HTTPXMock) -> None:
    for _ in range(3):
        httpx_mock.add_response(
            method="POST", url=f"{BASE_URL}/getDataFromVectorsAndLatestNPeriods", status_code=503
        )

    with WdsClient(retry_backoff_seconds=0.01) as client, pytest.raises(Exception):  # noqa: B017
        client.get_data_from_vectors_and_latest_n_periods([(2063949, 1)])

    assert len(httpx_mock.get_requests()) == 3


def test_get_code_sets_returns_the_object(httpx_mock: HTTPXMock) -> None:
    fixture = load_wds_fixture("code_sets")
    httpx_mock.add_response(
        method="GET",
        url=f"{BASE_URL}/getCodeSets",
        json=fixture["body"],
        status_code=200,
    )

    with WdsClient() as client:
        codes = client.get_code_sets()

    assert "status" in codes


def test_get_cube_metadata(httpx_mock: HTTPXMock) -> None:
    fixture = load_wds_fixture("cube_metadata")
    httpx_mock.add_response(
        method="POST",
        url=f"{BASE_URL}/getCubeMetadata",
        json=fixture["body"],
        status_code=200,
    )

    with WdsClient() as client:
        result = client.get_cube_metadata([14100287])

    assert result[0]["object"]["productId"] == "14100287"


def test_census_series_has_vector_zero_but_a_title(httpx_mock: HTTPXMock) -> None:
    """Exercises the exact discriminator documented in docs/mcp-tools-and-data-contract.md -
    a real Census series has vectorId 0 *and* a title; a non-existent coordinate has
    vectorId 0 and no title. The client itself doesn't interpret this (that's ticket #5's
    job) - this just confirms the raw response round-trips correctly."""
    fixture = load_wds_fixture("census_series_info")
    httpx_mock.add_response(
        method="POST",
        url=f"{BASE_URL}/getSeriesInfoFromCubePidCoord",
        json=fixture["body"],
        status_code=200,
    )

    with WdsClient() as client:
        result = client.get_series_info_from_cube_pid_coord([(98100001, "7.1.0.0.0.0.0.0.0.0")])

    obj = result[0]["object"]
    assert obj["vectorId"] == 0
    assert obj["SeriesTitleEn"]


def test_code_sets_are_fetched_once_per_client(httpx_mock: HTTPXMock) -> None:
    fixture = load_wds_fixture("code_sets")
    httpx_mock.add_response(method="GET", url=f"{BASE_URL}/getCodeSets", json=fixture["body"])

    with WdsClient() as client:
        first = client.get_code_sets()
        second = client.get_code_sets()

    assert first is second
    assert len(httpx_mock.get_requests()) == 1


def test_cube_metadata_is_cached_per_product(httpx_mock: HTTPXMock) -> None:
    fixture = load_wds_fixture("cube_metadata")
    httpx_mock.add_response(method="POST", url=f"{BASE_URL}/getCubeMetadata", json=fixture["body"])

    with WdsClient() as client:
        client.get_cube_metadata([14100287])
        result = client.get_cube_metadata([14100287])

    assert result[0]["object"]["productId"] == "14100287"
    assert len(httpx_mock.get_requests()) == 1


def test_cube_metadata_is_refetched_once_stale(httpx_mock: HTTPXMock) -> None:
    fixture = load_wds_fixture("cube_metadata")
    for _ in range(2):
        httpx_mock.add_response(
            method="POST", url=f"{BASE_URL}/getCubeMetadata", json=fixture["body"]
        )

    with WdsClient(metadata_ttl_seconds=0) as client:
        client.get_cube_metadata([14100287])
        client.get_cube_metadata([14100287])

    assert len(httpx_mock.get_requests()) == 2


def test_failed_cube_metadata_is_not_cached(httpx_mock: HTTPXMock) -> None:
    failed = [{"status": "FAILED", "object": "Product 99999999 not found"}]
    httpx_mock.add_response(method="POST", url=f"{BASE_URL}/getCubeMetadata", json=failed)
    httpx_mock.add_response(method="POST", url=f"{BASE_URL}/getCubeMetadata", json=failed)

    with WdsClient() as client:
        client.get_cube_metadata([99999999])
        result = client.get_cube_metadata([99999999])

    assert result[0]["status"] == "FAILED"
    assert len(httpx_mock.get_requests()) == 2
