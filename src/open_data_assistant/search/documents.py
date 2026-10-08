"""Transform a catalogue record (from catalogue.json) into an OpenSearch document."""

from __future__ import annotations

from typing import Any


def _to_date(value: str | None) -> str | None:
    """Extract the calendar date from an ISO datetime string.

    StatCan's start/end dates are always local (Eastern) midnight encoded in
    UTC (e.g. "2026-07-01T04:00:00Z" = 00:00 EDT on July 1) - the UTC offset
    never crosses a day boundary, so taking the date part directly is safe
    and avoids treating a reference-period boundary as a real timestamp.
    """
    if not value:
        return None
    return value[:10]


def build_search_text(record: dict[str, Any]) -> str:
    parts: list[str] = [record["title_en"]]
    parts.extend(s["en"] for s in record.get("subjects") or [])
    parts.extend(s["en"] for s in record.get("surveys") or [])
    for dimension in record.get("dimensions") or []:
        parts.append(dimension["name_en"])
        parts.extend(dimension.get("values_en") or [])
    return ". ".join(parts)


def to_opensearch_document(
    record: dict[str, Any], *, embedding: list[float] | None = None
) -> dict[str, Any]:
    """Build the OpenSearch document body for one catalogue record.

    Raises KeyError/TypeError on a malformed record - callers should catch
    and skip rather than let one bad record abort the whole ingestion.
    """
    document: dict[str, Any] = {
        "product_id": str(record["product_id"]),
        "cansim_id": record.get("cansim_id"),
        "title": {"en": record["title_en"], "fr": record["title_fr"]},
        "coverage": {
            "start_date": _to_date(record.get("cube_start_date")),
            "end_date": _to_date(record.get("cube_end_date")),
        },
        "frequency": record.get("frequency"),
        "archived": record["archived"],
        "issue_date": record.get("issue_date"),
        "release_time": record.get("release_time"),
        "subjects": record.get("subjects") or [],
        "surveys": record.get("surveys") or [],
        "dimensions": [
            {
                "name_en": d["name_en"],
                "name_fr": d["name_fr"],
                "position": d["position"],
                "values_en": d.get("values_en") or [],
                "values_fr": d.get("values_fr") or [],
            }
            for d in record.get("dimensions") or []
        ],
        "search_text": build_search_text(record),
    }
    if embedding is not None:
        document["embedding"] = embedding
    return document
