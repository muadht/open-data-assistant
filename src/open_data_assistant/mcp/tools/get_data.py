"""The `get_data` MCP tool.

The only tool that fetches actual data. Builds the 10-slot coordinate from `selections`,
resolves (or fails to resolve) a vector ID via `getSeriesInfoFromCubePidCoord`, routes to the
correct WDS data endpoint, applies the scalar factor, and decodes quality flags into the
standard `DataResult` shape. See docs/mcp-tools-and-data-contract.md's `get_data` section and
"WDS quirks" for why each step here exists.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from pydantic import HttpUrl

from ...wds.client import WdsClient
from ..schemas import DataPoint, DataResult, LatestNPeriod, Period, RangePeriod


def get_data(
    client: WdsClient, product_id: int, selections: dict[int, int], period: Period
) -> DataResult:
    coordinate = _build_coordinate(selections)
    is_census = str(product_id).startswith("9810")

    [cube_item] = client.get_cube_metadata([product_id])
    if cube_item["status"] != "SUCCESS":
        raise ValueError(f"getCubeMetadata failed for product {product_id}: {cube_item}")
    title_en: str = cube_item["object"]["cubeTitleEn"]

    [series_item] = client.get_series_info_from_cube_pid_coord([(product_id, coordinate)])
    if series_item["status"] != "SUCCESS":
        raise ValueError(
            f"getSeriesInfoFromCubePidCoord failed for {product_id}/{coordinate}: {series_item}"
        )
    series = series_item["object"]
    if not series["SeriesTitleEn"]:
        raise ValueError(
            f"No series exists for product {product_id} at coordinate {coordinate} - check "
            "that `selections` names a real member for every dimension of this table."
        )

    # WDS's vectorId: 0 sentinel means "no vector for this series" (always true for Census
    # tables, see docs/mcp-tools-and-data-contract.md) - normalized to None everywhere below.
    vector_id: int | None = series["vectorId"] or None

    if isinstance(period, RangePeriod):
        if vector_id is None:
            reason = "a Census table has no vector IDs" if is_census else "this series has none"
            raise ValueError(
                f"Cannot fetch a date range for product {product_id} at coordinate "
                f"{coordinate}: {reason}. Only a latestN query is possible here."
            )
        [item] = client.get_data_from_vector_by_reference_period_range(
            [vector_id], start_ref_period=period.start, end_reference_period=period.end
        )
    else:
        assert isinstance(period, LatestNPeriod)
        if vector_id is not None:
            [item] = client.get_data_from_vectors_and_latest_n_periods([(vector_id, period.n)])
        else:
            [item] = client.get_data_from_cube_pid_coord_and_latest_n_periods(
                [(product_id, coordinate, period.n)]
            )

    if item["status"] != "SUCCESS":
        raise ValueError(f"WDS data fetch failed for {product_id}/{coordinate}: {item}")
    obj = item["object"]

    code_sets = client.get_code_sets()
    data_points = [_to_data_point(p, series, code_sets) for p in obj["vectorDataPoint"]]

    return DataResult(
        product_id=product_id,
        title_en=title_en,
        coordinate=coordinate,
        vector_id=vector_id,
        series=data_points,
        source_url=HttpUrl(f"https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid={product_id}01"),
        retrieved_at=datetime.now(UTC),
    )


def _build_coordinate(selections: dict[int, int]) -> str:
    return ".".join(str(selections.get(position, 0)) for position in range(1, 11))


def _to_data_point(
    point: dict[str, Any], series: dict[str, Any], code_sets: dict[str, Any]
) -> DataPoint:
    status_by_code = {int(s["statusCode"]): s["statusDescEn"] for s in code_sets["status"]}
    symbol_by_code = {int(s["symbolCode"]): s["symbolDescEn"] for s in code_sets["symbol"]}
    security_by_code = {
        s["securityLevelCode"]: s["securityLevelDescEn"] for s in code_sets["securityLevel"]
    }
    uom_by_code = {u["memberUomCode"]: u["memberUomEn"] for u in code_sets["uom"]}

    raw_value = point["value"]
    symbol_code = point["symbolCode"]
    return DataPoint(
        ref_per=point["refPer"],
        # Decimals are pre-applied by WDS; the x10^scalarFactor is not (see "WDS quirks").
        value=None if raw_value == "" else float(raw_value) * (10 ** point["scalarFactorCode"]),
        uom=uom_by_code.get(series["memberUomCode"]) or "units",
        scalar_factor_applied=True,
        status=status_by_code.get(point["statusCode"], "unknown"),
        # symbolCode 0 ("none") is represented as no symbol at all, not the literal word "none".
        symbol=None if symbol_code == 0 else symbol_by_code.get(symbol_code),
        security_level=security_by_code.get(point["securityLevelCode"], "unknown"),
    )
