"""The `get_data` MCP tool.

The only tool that fetches actual data. Builds a 10-slot coordinate per requested series from
`selections` (one dimension may list several members), resolves vector IDs via
`getSeriesInfoFromCubePidCoord`, routes to the correct WDS data endpoint - batching all series
into one request per endpoint - applies the scalar factor, and decodes quality flags into one
standard `DataResult` per series. See docs/mcp-tools-and-data-contract.md's `get_data` section and
"WDS quirks" for why each step here exists.
"""

from __future__ import annotations

import html
import re
from collections.abc import Mapping
from datetime import UTC, datetime
from typing import Any

from pydantic import HttpUrl

from ...wds.client import WdsClient
from ..schemas import DataPoint, DataResult, LatestNPeriod, Period, RangePeriod

# Enough for every province and territory plus Canada; this is a targeted-query tool, not a
# table dump (see docs/mvp-scope.md's out-of-scope list).
MAX_SERIES_PER_CALL = 20


def get_data(
    client: WdsClient,
    product_id: int,
    selections: Mapping[int, int | list[int]],
    period: Period,
) -> list[DataResult]:
    expanded = _expand_selections(selections)
    coordinates = [_build_coordinate(s) for s in expanded]
    is_census = str(product_id).startswith("9810")

    [cube_item] = client.get_cube_metadata([product_id])
    if cube_item["status"] != "SUCCESS":
        raise ValueError(f"getCubeMetadata failed for product {product_id}: {cube_item}")
    cube = cube_item["object"]

    series_by_coordinate = _by_coordinate(
        client.get_series_info_from_cube_pid_coord([(product_id, c) for c in coordinates]),
        f"getSeriesInfoFromCubePidCoord for product {product_id}",
    )
    for coordinate in coordinates:
        if not series_by_coordinate[coordinate]["SeriesTitleEn"]:
            raise ValueError(
                f"No series exists for product {product_id} at coordinate {coordinate} - check "
                "that `selections` names a real member for every dimension of this table."
            )

    # WDS's vectorId: 0 sentinel means "no vector for this series" (always true for Census
    # tables, see docs/mcp-tools-and-data-contract.md) - normalized to None everywhere below.
    vector_ids: dict[str, int | None] = {
        c: series_by_coordinate[c]["vectorId"] or None for c in coordinates
    }
    with_vector = {c: v for c in coordinates if (v := vector_ids[c]) is not None}
    without_vector = [c for c in coordinates if vector_ids[c] is None]

    items: list[dict[str, Any]] = []
    if isinstance(period, RangePeriod):
        if without_vector:
            reason = "a Census table has no vector IDs" if is_census else "these series have none"
            raise ValueError(
                f"Cannot fetch a date range for product {product_id} at coordinate(s) "
                f"{', '.join(without_vector)}: {reason}. Only a latestN query is possible here."
            )
        items = client.get_data_from_vector_by_reference_period_range(
            list(with_vector.values()),
            start_ref_period=period.start,
            end_reference_period=period.end,
        )
    else:
        assert isinstance(period, LatestNPeriod)
        if with_vector:
            items += client.get_data_from_vectors_and_latest_n_periods(
                [(vector_id, period.n) for vector_id in with_vector.values()]
            )
        if without_vector:
            items += client.get_data_from_cube_pid_coord_and_latest_n_periods(
                [(product_id, c, period.n) for c in without_vector]
            )
    data_by_coordinate = _by_coordinate(items, f"WDS data fetch for product {product_id}")

    code_sets = client.get_code_sets()
    retrieved_at = datetime.now(UTC)
    return [
        DataResult(
            product_id=product_id,
            title_en=cube["cubeTitleEn"],
            series_title_en=series_by_coordinate[coordinate]["SeriesTitleEn"],
            members=_selected_members(cube, chosen),
            footnotes=_applicable_footnotes(cube, chosen),
            coordinate=coordinate,
            vector_id=vector_ids[coordinate],
            series=[
                _to_data_point(p, series_by_coordinate[coordinate], code_sets)
                for p in data_by_coordinate[coordinate]["vectorDataPoint"]
            ],
            source_url=HttpUrl(
                f"https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid={product_id}01"
            ),
            series_url=_series_url(vector_ids[coordinate], period),
            retrieved_at=retrieved_at,
        )
        for coordinate, chosen in zip(coordinates, expanded, strict=True)
    ]


def _expand_selections(selections: Mapping[int, int | list[int]]) -> list[dict[int, int]]:
    fixed = {p: m for p, m in selections.items() if isinstance(m, int)}
    listed = {p: m for p, m in selections.items() if isinstance(m, list)}
    if not listed:
        return [fixed]
    if len(listed) > 1:
        raise ValueError(
            "Only one dimension can list several members per get_data call; got lists for "
            f"dimensions {sorted(listed)}. Make one call per combination instead."
        )
    [(position, member_ids)] = listed.items()
    unique_ids = list(dict.fromkeys(member_ids))
    if not unique_ids:
        raise ValueError(f"Dimension {position} lists no members.")
    if len(unique_ids) > MAX_SERIES_PER_CALL:
        raise ValueError(
            f"Dimension {position} lists {len(unique_ids)} members; get_data returns at most "
            f"{MAX_SERIES_PER_CALL} series per call. For a whole table, point the user to "
            "StatCan's full-table CSV download instead."
        )
    return [{**fixed, position: member_id} for member_id in unique_ids]


def _by_coordinate(items: list[dict[str, Any]], what: str) -> dict[str, dict[str, Any]]:
    # WDS doesn't return batched items in request order (live-verified 2026-10-09), so
    # results are matched back by coordinate, which every SUCCESS item carries.
    failed = [item for item in items if item["status"] != "SUCCESS"]
    if failed:
        raise ValueError(f"{what} failed: {failed}")
    return {item["object"]["coordinate"]: item["object"] for item in items}


def _series_url(vector_id: int | None, period: Period) -> HttpUrl | None:
    if vector_id is None:
        return None
    url = (
        "https://www150.statcan.gc.ca/t1/tbl1/en/sbv.action"
        f"?vectorNumbers=v{vector_id}&searchOption=2"
    )
    # No verified date-range parameter for sbv.action; without latestN it shows just the
    # latest period, so a range query still links to the right series.
    if isinstance(period, LatestNPeriod):
        url += f"&latestN={period.n}"
    return HttpUrl(url)


def _build_coordinate(selections: dict[int, int]) -> str:
    return ".".join(str(selections.get(position, 0)) for position in range(1, 11))


def _selected_members(cube: dict[str, Any], selections: dict[int, int]) -> dict[str, str]:
    members: dict[str, str] = {}
    for dimension in cube["dimension"]:
        member_id = selections[dimension["dimensionPositionId"]]
        name_by_id = {m["memberId"]: m["memberNameEn"] for m in dimension["member"]}
        members[dimension["dimensionNameEn"]] = name_by_id[member_id]
    return members


def _applicable_footnotes(cube: dict[str, Any], selections: dict[int, int]) -> list[str]:
    # A footnote's link targets the whole table (dimension 0), a whole dimension (member 0),
    # or one member. WDS repeats a footnote once per linked member, hence the dedupe by id.
    texts: dict[int, str] = {}
    for footnote in cube["footnote"]:
        link = footnote["link"]
        position, member_id = link["dimensionPositionId"], link["memberId"]
        if position == 0 or member_id == 0 or selections.get(position) == member_id:
            texts.setdefault(footnote["footnoteId"], _plain_text(footnote["footnotesEn"]))
    return list(texts.values())


def _plain_text(footnote_html: str) -> str:
    # Some footnotes are HTML (e.g. Census table 98100001's "<p><strong>Content considerations").
    return " ".join(html.unescape(re.sub(r"<[^>]+>", " ", footnote_html)).split())


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
        # Rounding to the published decimals drops float noise from the scalar-factor multiply.
        value=None
        if raw_value == ""
        else round(float(raw_value) * 10 ** point["scalarFactorCode"], point["decimals"]),
        uom=uom_by_code.get(series["memberUomCode"]) or "units",
        scalar_factor_applied=True,
        status=status_by_code.get(point["statusCode"], "unknown"),
        # symbolCode 0 ("none") is represented as no symbol at all, not the literal word "none".
        symbol=None if symbol_code == 0 else symbol_by_code.get(symbol_code),
        security_level=security_by_code.get(point["securityLevelCode"], "unknown"),
        decimals=point["decimals"],
        release_time=point["releaseTime"],
    )
