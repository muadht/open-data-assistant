"""The `get_data` MCP tool.

The only tool that fetches actual data. Builds a 10-slot coordinate per requested series from
`selections` (dimensions may list several members; every combination is fetched), fetches all
series in one batched WDS request, applies the scalar factor, and decodes quality flags into
one standard `DataResult` per series. See docs/mcp-tools-and-data-contract.md's `get_data`
section and "WDS quirks" for why each step here exists.

A latestN query fetches by coordinate (`getDataFromCubePidCoordAndLatestNPeriods`), which
returns each series' data and vector ID together - live-measured (2026-10-10) at 0.5 s for 20
series and 1.5 s for 200, against 1.8 s and 14.6 s by vector. A date range has no coordinate
endpoint, so it first resolves vector IDs (`getSeriesInfoFromCubePidCoord`), then fetches by
vector. Series titles and units come from the (cached) cube metadata either way: a series
title is its members' names joined by ";", and its unit is the memberUomCode of its member of
the dimension that has units (both live-verified against getSeriesInfoFromCubePidCoord).
"""

from __future__ import annotations

import html
import itertools
import re
from collections.abc import Mapping
from datetime import UTC, datetime
from typing import Any

from pydantic import HttpUrl

from ...wds.client import WdsClient
from ..schemas import DataPoint, DataResult, LatestNPeriod, Period, RangePeriod

# Enough for e.g. every province and territory by sex by a few age groups in one call. WDS
# documents a per-request data-point limit without stating it; 200 series x 12 periods and
# 50 series x 26 years both succeeded live. Still a targeted-query tool, not a table dump
# (see docs/mvp-scope.md's out-of-scope list).
MAX_SERIES_PER_CALL = 100


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

    if isinstance(period, RangePeriod):
        data_by_coordinate, vector_ids = _fetch_range(
            client, product_id, coordinates, period, is_census
        )
    else:
        assert isinstance(period, LatestNPeriod)
        data_by_coordinate, vector_ids = _fetch_latest_n(client, product_id, coordinates, period)

    code_sets = client.get_code_sets()
    retrieved_at = datetime.now(UTC)
    results: list[DataResult] = []
    for coordinate, chosen in zip(coordinates, expanded, strict=True):
        members = _selected_members(cube, chosen)
        uom_code = _uom_code(cube, chosen)
        results.append(
            DataResult(
                product_id=product_id,
                title_en=cube["cubeTitleEn"],
                series_title_en=";".join(members.values()),
                members=members,
                footnotes=_applicable_footnotes(cube, chosen),
                coordinate=coordinate,
                vector_id=vector_ids[coordinate],
                series=[
                    _to_data_point(p, uom_code, code_sets)
                    for p in data_by_coordinate[coordinate]["vectorDataPoint"]
                ],
                source_url=HttpUrl(
                    f"https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid={product_id}01"
                ),
                series_url=_series_url(vector_ids[coordinate], period),
                retrieved_at=retrieved_at,
            )
        )
    return results


def _fetch_latest_n(
    client: WdsClient, product_id: int, coordinates: list[str], period: LatestNPeriod
) -> tuple[dict[str, dict[str, Any]], dict[str, int | None]]:
    items = client.get_data_from_cube_pid_coord_and_latest_n_periods(
        [(product_id, c, period.n) for c in coordinates]
    )
    # A coordinate with no series comes back FAILED with responseStatusCode 2 (see
    # nonexistent_coordinate_data.json) - the model's mistake, worth a clear message.
    missing = [
        item["object"]["coordinate"]
        for item in items
        if item["status"] != "SUCCESS" and item.get("object", {}).get("responseStatusCode") == 2
    ]
    if missing:
        raise _no_series_error(product_id, missing)
    data = _by_coordinate(items, f"WDS data fetch for product {product_id}")
    # WDS's vectorId: 0 sentinel means "no vector for this series" (always true for Census
    # tables, see docs/mcp-tools-and-data-contract.md) - normalized to None.
    return data, {c: data[c]["vectorId"] or None for c in coordinates}


def _fetch_range(
    client: WdsClient,
    product_id: int,
    coordinates: list[str],
    period: RangePeriod,
    is_census: bool,
) -> tuple[dict[str, dict[str, Any]], dict[str, int | None]]:
    series = _by_coordinate(
        client.get_series_info_from_cube_pid_coord([(product_id, c) for c in coordinates]),
        f"getSeriesInfoFromCubePidCoord for product {product_id}",
    )
    # A nonexistent coordinate is SUCCESS here, with every field empty (nonexistent_coordinate
    # .json); a Census series also has vectorId 0 but a real title, so the title tells them apart.
    missing = [c for c in coordinates if not series[c]["SeriesTitleEn"]]
    if missing:
        raise _no_series_error(product_id, missing)
    vector_ids: dict[str, int | None] = {c: series[c]["vectorId"] or None for c in coordinates}
    without_vector = [c for c in coordinates if vector_ids[c] is None]
    if without_vector:
        reason = "a Census table has no vector IDs" if is_census else "these series have none"
        raise ValueError(
            f"Cannot fetch a date range for product {product_id} at coordinate(s) "
            f"{', '.join(without_vector)}: {reason}. Only a latestN query is possible here."
        )
    items = client.get_data_from_vector_by_reference_period_range(
        [v for v in vector_ids.values() if v is not None],
        start_ref_period=period.start,
        end_reference_period=period.end,
    )
    return _by_coordinate(items, f"WDS data fetch for product {product_id}"), vector_ids


def _no_series_error(product_id: int, coordinates: list[str]) -> ValueError:
    return ValueError(
        f"No series exists for product {product_id} at coordinate(s) {', '.join(coordinates)} - "
        "check that `selections` names a real member for every dimension of this table."
    )


def _expand_selections(selections: Mapping[int, int | list[int]]) -> list[dict[int, int]]:
    """One selection per series: every combination of the listed members, in the order
    given (e.g. 11 provinces x 2 sexes -> 22 series, province by province)."""
    positions = list(selections)
    choices: list[list[int]] = []
    for position in positions:
        members = selections[position]
        if isinstance(members, int):
            choices.append([members])
            continue
        unique_ids = list(dict.fromkeys(members))
        if not unique_ids:
            raise ValueError(f"Dimension {position} lists no members.")
        choices.append(unique_ids)
    count = 1
    for options in choices:
        count *= len(options)
    if count > MAX_SERIES_PER_CALL:
        raise ValueError(
            f"`selections` asks for {count} series (every combination of the listed members); "
            f"get_data returns at most {MAX_SERIES_PER_CALL} series per call. Narrow the "
            "selection, or for a whole table point the user to StatCan's full-table CSV "
            "download instead."
        )
    return [dict(zip(positions, combo, strict=True)) for combo in itertools.product(*choices)]


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


def _uom_code(cube: dict[str, Any], selections: dict[int, int]) -> int | None:
    """The series' unit: its member of the dimension that carries units (`hasUom`) - what
    getSeriesInfoFromCubePidCoord reports as memberUomCode. Every active table has one."""
    for dimension in cube["dimension"]:
        if dimension.get("hasUom"):
            member_id = selections[dimension["dimensionPositionId"]]
            for member in dimension["member"]:
                if member["memberId"] == member_id:
                    return int(member["memberUomCode"])
    return None


def _to_data_point(
    point: dict[str, Any], uom_code: int | None, code_sets: dict[str, Any]
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
        uom=(uom_by_code.get(uom_code) if uom_code is not None else None) or "units",
        scalar_factor_applied=True,
        status=status_by_code.get(point["statusCode"], "unknown"),
        # symbolCode 0 ("none") is represented as no symbol at all, not the literal word "none".
        symbol=None if symbol_code == 0 else symbol_by_code.get(symbol_code),
        security_level=security_by_code.get(point["securityLevelCode"], "unknown"),
        decimals=point["decimals"],
        release_time=point["releaseTime"],
    )
