"""Pydantic models for the MCP tool contract.

These are the actual tool input/output types (not just documentation of them) - Pydantic AI
generates each tool's JSON Schema from these for the LLM, and validates every tool call's
arguments and return value against them. Field descriptions below are part of that schema, so
they matter to the LLM, not only to a human reader.

Mirrors docs/mcp-tools-and-data-contract.md in the parent project - keep the two in sync.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, Field, HttpUrl

# --------------------------------------------------------------------------------------- shared


class DateRange(BaseModel):
    start: str = Field(description="First reference period the table covers, YYYY-MM-DD.")
    end: str = Field(description="Most recent reference period the table covers, YYYY-MM-DD.")


class MemberCandidate(BaseModel):
    """One member of a dimension - returned by get_table_structure and find_members."""

    member_id: int
    name_en: str
    parent_member_id: int | None = Field(
        default=None,
        description=(
            "The member this one sits under (e.g. a province under Canada); None at the top."
        ),
    )
    terminated: bool = Field(description="True if this member is no longer in use.")


# ------------------------------------------------------------------------------- search_tables


class TableSearchFilters(BaseModel):
    """Optional structured constraints for `search_tables`, applied in addition to - not
    instead of - the year/frequency/identifier extraction `search_tables` already does on the
    query text itself (see the data contract doc)."""

    subject: str | None = None
    frequency: Literal["daily", "weekly", "monthly", "quarterly", "annual"] | None = None
    include_archived: bool = Field(
        default=False, description="Include archived/discontinued tables in the results."
    )


class TableCandidate(BaseModel):
    product_id: int = Field(description="8-digit StatCan product/cube ID.")
    title_en: str
    subjects: list[str] = Field(default_factory=list)
    frequency: str
    date_range: DateRange
    is_active: bool = Field(description="False if the table is archived/discontinued.")
    score: float = Field(description="Relative ranking score; not comparable across queries.")


# -------------------------------------------------------------------------- get_table_structure


class DimensionInfo(BaseModel):
    dimension_position_id: int = Field(
        description="1-based position of this dimension in the coordinate."
    )
    name_en: str
    has_uom: bool = Field(description="True if this dimension itself carries the unit of measure.")
    members: list[MemberCandidate] = Field(
        description=(
            "This dimension's members, top-level first (usually the totals and headline "
            "categories, e.g. 'Canada', 'Total - Gender', 'All-items'). Pick member_ids for "
            "get_data straight from here. If member_count is larger than this list, it's "
            "truncated - use find_members to search the rest."
        )
    )
    member_count: int = Field(description="Total members in this dimension.")


class TableStructure(BaseModel):
    product_id: int
    title_en: str
    dimensions: list[DimensionInfo]
    default_scalar_factor: str = Field(
        description=(
            "A best-effort placeholder (usually 'units'), not a reliable per-table value - "
            "WDS only exposes scalar factor per-series, not per-table. get_data applies the "
            "real scalar factor for the specific series fetched; don't use this field to "
            "predict or double-check that."
        )
    )
    frequency: str
    is_census_table: bool = Field(
        description=(
            "True when product_id starts with 9810. Census tables have no vector IDs - only "
            "coordinate-based fetches work, and date-range queries are not possible."
        )
    )


# ------------------------------------------------------------------------------------ get_data


class LatestNPeriod(BaseModel):
    type: Literal["latestN"] = "latestN"
    n: int = Field(gt=0, description="Number of most recent reference periods to return.")


class RangePeriod(BaseModel):
    type: Literal["range"] = "range"
    start: str = Field(description="YYYY-MM-DD. Only possible for a series that has a vector ID.")
    end: str = Field(description="YYYY-MM-DD.")


Period = Annotated[LatestNPeriod | RangePeriod, Field(discriminator="type")]


class GetDataInput(BaseModel):
    product_id: int
    selections: dict[int, int | list[int]] = Field(
        description=(
            "dimensionPositionId -> memberId for every dimension of the table. At most one "
            "dimension may map to a list of memberIds (up to 20), to fetch one series per "
            "member in a single call."
        )
    )
    period: Period


class DataPoint(BaseModel):
    ref_per: str = Field(description="Reference period this value is about, YYYY-MM-DD.")
    value: float | None = Field(
        default=None, description="None when the value is suppressed or otherwise unavailable."
    )
    uom: str = Field(description="Unit of measure, e.g. 'Percent', 'Persons', 'Dollars'.")
    scalar_factor_applied: bool = Field(
        description="Always True in a DataResult - the scalar factor is already applied to `value`."
    )
    status: str = Field(
        description="Decoded quality status, e.g. 'normal', 'data quality: very good'."
    )
    symbol: str | None = None
    security_level: str = Field(description="Decoded security level, e.g. 'Unclassified'.")
    decimals: int = Field(
        description="Decimal places StatCan publishes this value with - show it at this precision."
    )
    release_time: str = Field(
        description="When StatCan released this value, YYYY-MM-DDTHH:MM, Eastern time."
    )


class DataResult(BaseModel):
    product_id: int
    title_en: str
    series_title_en: str = Field(
        description=(
            "StatCan's name for this exact series, one member per dimension separated by ';' - "
            "e.g. 'Ontario;Unemployment rate;Total - Gender;...'. Use it to tell series apart."
        )
    )
    members: dict[str, str] = Field(
        description=(
            "Dimension name -> the member this series is for, e.g. {'Geography': 'Ontario'}."
        )
    )
    footnotes: list[str] = Field(
        description=(
            "StatCan's footnotes for this series: those on the whole table, on its dimensions, "
            "or on the selected members. They can change how the numbers should be read (e.g. "
            "'The CPI is not a cost-of-living index'), so take them into account and mention "
            "any that matter to the user's question."
        )
    )
    coordinate: str = Field(description="10-slot, dot-separated, zero-padded coordinate.")
    vector_id: int | None = Field(
        default=None,
        description=(
            "None if this series has no vector ID (e.g. a Census table). WDS itself returns 0 "
            "for this case; that sentinel is normalized to None here."
        ),
    )
    series: list[DataPoint]
    source_url: HttpUrl = Field(description="StatCan page for the whole table.")
    series_url: HttpUrl | None = Field(
        default=None,
        description=(
            "StatCan page for this exact series (vector) - cite this alongside source_url. "
            "None when vector_id is None (e.g. a Census table); cite source_url alone then."
        ),
    )
    retrieved_at: datetime
