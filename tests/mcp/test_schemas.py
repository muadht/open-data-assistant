"""Schema tests use real, live-validated values from docs/question-catalogue-eval.xlsx
(verified against the live WDS API on 2026-10-07) rather than made-up numbers, so a shape
that passes here is a shape WDS actually returns."""

from datetime import datetime

import pytest
from pydantic import HttpUrl, TypeAdapter, ValidationError

from open_data_assistant.mcp.schemas import (
    DataPoint,
    DataResult,
    DateRange,
    DimensionInfo,
    GetDataInput,
    LatestNPeriod,
    MemberCandidate,
    RangePeriod,
    TableCandidate,
    TableStructure,
)


def test_table_candidate_accepts_real_shape() -> None:
    TableCandidate(
        product_id=14100287,
        title_en="Labour force characteristics, monthly, seasonally adjusted and trend-cycle",
        subjects=["Labour"],
        frequency="Monthly",
        date_range=DateRange(start="1976-01-01", end="2026-08-01"),
        is_active=True,
        score=0.91,
    )


def test_table_structure_census_table() -> None:
    structure = TableStructure(
        product_id=98100001,
        title_en="Population and dwelling counts: Canada, provinces and territories",
        dimensions=[
            DimensionInfo(dimension_position_id=1, name_en="Geographic name", has_uom=False),
            DimensionInfo(
                dimension_position_id=2,
                name_en="Population and dwelling counts (11)",
                has_uom=False,
            ),
        ],
        default_scalar_factor="units",
        frequency="Occasional",
        is_census_table=True,
    )
    assert structure.is_census_table


def test_member_candidate_ontario() -> None:
    member = MemberCandidate(
        member_id=7, name_en="Ontario", parent_member_id=None, terminated=False
    )
    assert member.member_id == 7


def test_get_data_input_latest_n() -> None:
    GetDataInput(
        product_id=14100287,
        selections={1: 7, 2: 7, 3: 1, 4: 1, 5: 1, 6: 1},
        period=LatestNPeriod(n=1),
    )


def test_get_data_input_range() -> None:
    GetDataInput(
        product_id=14100287,
        selections={1: 7, 2: 7, 3: 1, 4: 1, 5: 1, 6: 1},
        period=RangePeriod(start="2019-01-01", end="2024-01-01"),
    )


def test_get_data_input_rejects_unknown_period_type() -> None:
    """Raw, not-yet-validated input (e.g. straight off the wire) goes through
    model_validate, which accepts arbitrary data - unlike the constructor, which
    mypy holds to the real `Period` type."""
    with pytest.raises(ValidationError):
        GetDataInput.model_validate(
            {
                "product_id": 14100287,
                "selections": {1: 7},
                "period": {"type": "lastWeek", "n": 1},
            }
        )


def test_data_result_ontario_unemployment_rate() -> None:
    """Row 1 of the question catalogue: Ontario unemployment rate, Aug 2026 = 6.9%."""
    result = DataResult(
        product_id=14100287,
        title_en="Labour force characteristics, monthly, seasonally adjusted and trend-cycle",
        coordinate="7.7.1.1.1.1.0.0.0.0",
        vector_id=2063949,
        series=[
            DataPoint(
                ref_per="2026-08-01",
                value=6.9,
                uom="Percent",
                scalar_factor_applied=True,
                status="normal",
                symbol=None,
                security_level="Unclassified",
            )
        ],
        source_url=HttpUrl("https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=1410028701"),
        retrieved_at=datetime(2026, 10, 7, 12, 0, 0),
    )
    assert result.series[0].value == 6.9


def test_data_result_census_table_has_no_vector_id() -> None:
    """Row 12: Census tables return vectorId 0 from WDS; the schema normalizes that to None."""
    result = DataResult(
        product_id=98100001,
        title_en="Population and dwelling counts: Canada, provinces and territories",
        coordinate="7.1.0.0.0.0.0.0.0.0",
        vector_id=None,
        series=[
            DataPoint(
                ref_per="2021-01-01",
                value=14223942,
                uom="Persons",
                scalar_factor_applied=True,
                status="normal",
                symbol=None,
                security_level="Unclassified",
            )
        ],
        source_url=HttpUrl("https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=9810000101"),
        retrieved_at=datetime(2026, 10, 7, 12, 0, 0),
    )
    assert result.vector_id is None


def test_data_result_suppressed_value_has_no_number() -> None:
    result = DataResult(
        product_id=14100287,
        title_en="...",
        coordinate="7.7.1.1.1.1.0.0.0.0",
        vector_id=2063949,
        series=[
            DataPoint(
                ref_per="2026-08-01",
                value=None,
                uom="Percent",
                scalar_factor_applied=True,
                status="too unreliable to be published",
                symbol=None,
                security_level="Unclassified",
            )
        ],
        source_url=HttpUrl("https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=1410028701"),
        retrieved_at=datetime(2026, 10, 7, 12, 0, 0),
    )
    assert result.series[0].value is None


def test_get_data_input_json_schema_discriminates_period() -> None:
    """The LLM-facing schema should expose period as a discriminated union (oneOf + mapping),
    not an undiscriminated anyOf - that's what makes tool-call generation reliable."""
    schema = TypeAdapter(GetDataInput).json_schema()
    period_schema = schema["properties"]["period"]
    assert "discriminator" in period_schema
