"""The `get_table_structure` MCP tool.

Wraps `getCubeMetadata` (+ `getCodeSets`) to return a `TableStructure` - the table's
dimensions, frequency, and whether it's a Census table. See
docs/mcp-tools-and-data-contract.md for the full contract.
"""

from __future__ import annotations

from ...wds.client import WdsClient
from ..schemas import DimensionInfo, TableStructure


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
