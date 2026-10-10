"""Sanity-checks for every recorded WDS fixture - not testing WDS itself (that's ticket #2's
job, against these same fixtures), but confirming each file actually demonstrates the quirk
it claims to, so a future change to this directory can't silently break one.
"""

from __future__ import annotations

import pytest

from tests.fixtures.wds import FIXTURE_NAMES, load_wds_fixture


@pytest.mark.parametrize("name", FIXTURE_NAMES)
def test_every_fixture_loads_and_has_the_common_envelope(name: str) -> None:
    fixture = load_wds_fixture(name)
    assert set(fixture) == {
        "description",
        "captured_at",
        "source",
        "request",
        "http_status",
        "body",
    }
    assert fixture["source"] in ("live", "constructed")


def test_normal_data_point_is_a_healthy_success() -> None:
    fixture = load_wds_fixture("normal_data_point")
    assert fixture["http_status"] == 200
    point = fixture["body"][0]["object"]["vectorDataPoint"][0]
    assert point["value"] == 6.9
    assert point["statusCode"] == 0


def test_census_series_info_has_vector_zero_but_a_real_title() -> None:
    fixture = load_wds_fixture("census_series_info")
    obj = fixture["body"][0]["object"]
    assert obj["vectorId"] == 0
    assert obj["SeriesTitleEn"]  # truthy - this is what makes it a *real* series


def test_nonexistent_coordinate_also_has_vector_zero_but_no_title() -> None:
    fixture = load_wds_fixture("nonexistent_coordinate")
    obj = fixture["body"][0]["object"]
    assert obj["vectorId"] == 0
    assert obj["SeriesTitleEn"] is None
    assert obj["responseStatusCode"] == 2


def test_census_and_nonexistent_coordinate_are_distinguishable_only_by_title() -> None:
    """The actual point of capturing both: vectorId alone can't tell them apart."""
    census = load_wds_fixture("census_series_info")["body"][0]["object"]
    nonexistent = load_wds_fixture("nonexistent_coordinate")["body"][0]["object"]
    assert census["vectorId"] == nonexistent["vectorId"] == 0
    assert bool(census["SeriesTitleEn"]) != bool(nonexistent["SeriesTitleEn"])


def test_census_data_point_is_fetched_by_coordinate_with_no_vector_id() -> None:
    fixture = load_wds_fixture("census_data_point")
    obj = fixture["body"][0]["object"]
    assert obj["vectorId"] == 0
    assert obj["vectorDataPoint"][0]["value"] == 14223942.0


def test_malformed_coordinate_is_rejected_with_406() -> None:
    fixture = load_wds_fixture("malformed_coordinate_406")
    assert fixture["http_status"] == 406
    assert "co-ordinate" in fixture["body"]["message"]


def test_vector_zero_is_rejected_with_406() -> None:
    fixture = load_wds_fixture("vector_zero_406")
    assert fixture["http_status"] == 406
    assert "vector id or latest N" in fixture["body"]["message"]


def test_suppressed_value_has_empty_value_and_a_nonzero_status() -> None:
    fixture = load_wds_fixture("suppressed_value")
    assert fixture["source"] == "constructed"
    point = fixture["body"][0]["object"]["vectorDataPoint"][0]
    assert point["value"] == ""
    assert point["statusCode"] != 0


def test_normal_series_info_resolves_a_real_vector_id() -> None:
    fixture = load_wds_fixture("normal_series_info")
    obj = fixture["body"][0]["object"]
    assert obj["vectorId"] == 2063949
    assert obj["memberUomCode"] == 239  # Percent, per code_sets.json


def test_suppressed_series_info_matches_suppressed_value_coordinate() -> None:
    series_info = load_wds_fixture("suppressed_series_info")["body"][0]["object"]
    data = load_wds_fixture("suppressed_value")["body"][0]["object"]
    assert series_info["productId"] == data["productId"]
    assert series_info["coordinate"] == data["coordinate"]
    assert series_info["vectorId"] == data["vectorId"]


def test_range_data_point_has_61_points_matching_the_eval_catalogue() -> None:
    fixture = load_wds_fixture("range_data_point")
    points = fixture["body"][0]["object"]["vectorDataPoint"]
    assert len(points) == 61
    assert points[0]["refPer"] == "2019-01-01"
    assert points[0]["value"] == 5.6
    assert points[-1]["refPer"] == "2024-01-01"
    assert points[-1]["value"] == 6.1


def test_gdp_data_point_needs_its_scalar_factor_applied() -> None:
    fixture = load_wds_fixture("gdp_data_point")
    point = fixture["body"][0]["object"]["vectorDataPoint"][0]
    assert point["value"] == 3437720.0
    assert point["scalarFactorCode"] == 6  # millions - raw value is not the real one


def test_maintenance_window_is_409_with_no_body() -> None:
    fixture = load_wds_fixture("maintenance_window_409")
    assert fixture["source"] == "constructed"
    assert fixture["http_status"] == 409
    assert fixture["body"] is None


def test_cube_metadata_has_dimensions() -> None:
    fixture = load_wds_fixture("cube_metadata")
    obj = fixture["body"][0]["object"]
    assert obj["productId"] == "14100287"
    assert len(obj["dimension"]) > 0


def test_census_and_gdp_cube_metadata_have_the_real_verified_titles() -> None:
    census = load_wds_fixture("census_cube_metadata")["body"][0]["object"]
    gdp = load_wds_fixture("gdp_cube_metadata")["body"][0]["object"]
    assert (
        census["cubeTitleEn"] == "Population and dwelling counts: Canada, provinces and territories"
    )
    assert gdp["cubeTitleEn"] == "Gross domestic product, expenditure-based, Canada, quarterly"


def test_code_sets_has_the_lookup_tables_other_tools_need() -> None:
    fixture = load_wds_fixture("code_sets")
    assert fixture["body"]["status"] == "SUCCESS"
    codes = fixture["body"]["object"]
    for table in ("status", "symbol", "scalar", "frequency", "uom", "securityLevel"):
        assert table in codes


def test_batched_data_point_comes_back_in_a_different_order_than_requested() -> None:
    fixture = load_wds_fixture("batched_data_point")
    requested = [item["vectorId"] for item in fixture["request"]["body"]]
    returned = [item["object"]["vectorId"] for item in fixture["body"]]
    assert sorted(requested) == sorted(returned)
    assert requested != returned
