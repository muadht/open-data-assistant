"""The `get_table_structure` MCP tool.

Wraps `getCubeMetadata` (+ `getCodeSets`) to return a `TableStructure` - the table's
dimensions with their members (capped per dimension), frequency, and whether it's a Census
table. See
docs/mcp-tools-and-data-contract.md for the full contract.
"""

from __future__ import annotations

from typing import Any

from ...wds.client import WdsClient
from ..schemas import DimensionInfo, MemberCandidate, TableStructure

# Enough to list every member of most dimensions (provinces, sexes, age groups, data types),
# while a dimension with thousands (fine Census geography) can't flood the model's context.
MAX_MEMBERS_LISTED = 30


def get_table_structure(client: WdsClient, product_id: int) -> TableStructure:
    [item] = client.get_cube_metadata([product_id])
    if item["status"] != "SUCCESS":
        raise ValueError(f"getCubeMetadata failed for product {product_id}: {item}")
    obj = item["object"]

    code_sets = client.get_code_sets()
    frequency_by_code = {f["frequencyCode"]: f for f in code_sets["frequency"]}
    frequency = frequency_by_code.get(obj["frequencyCode"], {}).get("frequencyDescEn", "Unknown")

    dimensions = [
        DimensionInfo(
            dimension_position_id=d["dimensionPositionId"],
            name_en=d["dimensionNameEn"],
            has_uom=d["hasUom"],
            members=_top_members(d["member"], MAX_MEMBERS_LISTED),
            member_count=len(d["member"]),
        )
        for d in obj["dimension"]
    ]

    return TableStructure(
        product_id=int(obj["productId"]),
        title_en=obj["cubeTitleEn"],
        dimensions=dimensions,
        # getCubeMetadata has no table-level scalar factor field - WDS only exposes scalar
        # factor per-series, via getSeriesInfoFromCubePidCoord's scalarFactorCode (see
        # get_data, ticket #5). "units" is a documented placeholder, not a real default - it
        # happens to be correct for most tables (unemployment rate, CPI, population
        # estimates), but get_data must apply the real per-series scalar factor regardless
        # of what this field says.
        default_scalar_factor="units",
        frequency=frequency,
        is_census_table=str(product_id).startswith("9810"),
    )


def _top_members(members: list[dict[str, Any]], limit: int) -> list[MemberCandidate]:
    """Up to `limit` members, shallowest first: the top level (usually totals and headline
    categories), then their children, and so on - WDS's own order within each level."""
    parent_of = {m["memberId"]: m.get("parentMemberId") for m in members}

    def depth(member_id: int) -> int:
        level, seen = 0, set()
        parent = parent_of.get(member_id)
        while parent is not None and parent in parent_of and parent not in seen:
            seen.add(parent)
            level += 1
            parent = parent_of.get(parent)
        return level

    by_depth = sorted(members, key=lambda m: depth(m["memberId"]))  # stable within a level
    return [
        MemberCandidate(
            member_id=m["memberId"],
            name_en=m["memberNameEn"],
            parent_member_id=m.get("parentMemberId"),
            terminated=bool(m.get("terminated")),
        )
        for m in by_depth[:limit]
    ]
