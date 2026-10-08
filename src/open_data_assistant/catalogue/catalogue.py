"""Build a flat, denormalized catalogue of StatCan products from WDS responses.

This is the ingestion foundation: one record per product, combining
`getAllCubesList` with resolved subject/survey/frequency labels from
`getCodeSets`. It intentionally stops short of per-product dimension
*members* (categories) - those come from `getCubeMetadata` and are
much heavier (thousands of members across all cubes), so they're left
for a later, on-demand enrichment step rather than the initial catalogue.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field, replace
from typing import Any

import httpx

from .wds_client import WdsClient


@dataclass(frozen=True)
class CodeRef:
    code: str
    en: str
    fr: str


@dataclass(frozen=True)
class DimensionRef:
    name_en: str
    name_fr: str
    position: int
    has_uom: bool
    values_en: list[str] = field(default_factory=list)
    values_fr: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class CatalogueRecord:
    product_id: int
    cansim_id: str | None
    title_en: str
    title_fr: str
    cube_start_date: str | None
    cube_end_date: str | None
    issue_date: str | None
    release_time: str | None
    archived: bool
    frequency: CodeRef | None
    subjects: list[CodeRef] = field(default_factory=list)
    surveys: list[CodeRef] = field(default_factory=list)
    dimensions: list[DimensionRef] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def build_catalogue(client: WdsClient) -> list[CatalogueRecord]:
    cubes = client.get_all_cubes_list()
    code_sets = client.get_code_sets()

    subjects_by_code = {s["subjectCode"]: s for s in code_sets["subject"]}
    surveys_by_code = {s["surveyCode"]: s for s in code_sets["survey"]}
    frequency_by_code = {f["frequencyCode"]: f for f in code_sets["frequency"]}

    return [
        _to_record(cube, subjects_by_code, surveys_by_code, frequency_by_code) for cube in cubes
    ]


# Subject codes are a 3-level hierarchy encoded by prefix length: 2 digits
# (e.g. "35"), 4 digits ("3501"), 6 digits ("350102"). Verified against
# getCodeSets - every code is exactly one of these three lengths.
_SUBJECT_CODE_LEVELS = (2, 4, 6)


def _subject_ancestor_codes(code: str) -> list[str]:
    """All ancestor codes of `code`, shortest (most general) first, inclusive."""
    return [code[:n] for n in _SUBJECT_CODE_LEVELS if len(code) >= n]


def _near_root_member_names(members: list[dict[str, Any]]) -> tuple[list[str], list[str]]:
    """Names of members at hierarchy depth 0 or 1 (root and its direct children).

    Some dimensions (fine-grained census geography, detailed classifications)
    have thousands of leaf members - useless noise for search/embeddings.
    Root-level members capture what the dimension represents (e.g. "Provinces
    and Territories") without enumerating every leaf (e.g. every dissemination
    area).
    """
    by_id = {m["memberId"]: m for m in members}

    def depth(member: dict[str, Any]) -> int:
        d = 0
        current = member
        while current.get("parentMemberId") is not None:
            parent = by_id.get(current["parentMemberId"])
            if parent is None:
                break
            current, d = parent, d + 1
        return d

    near_root = [m for m in members if depth(m) <= 1]
    return (
        [m["memberNameEn"] for m in near_root],
        [m["memberNameFr"] for m in near_root],
    )


def enrich_from_cube_metadata(
    records: list[CatalogueRecord],
    client: WdsClient,
    *,
    chunk_size: int = 50,
    chunk_timeout: float = 45.0,
) -> list[CatalogueRecord]:
    """Replace coarse subjects and dimension names with the fuller picture
    from `getCubeMetadata` - fine-grained subject classification (with its
    full ancestor chain) and near-root dimension member values.

    `getAllCubesList` truncates `subjectCode` to the top-level 2-digit code
    (e.g. "35" - "Crime and justice"), even for products that actually belong
    to a more specific subcategory, and doesn't include dimension members
    (categories) at all. `getCubeMetadata` has both. Verified by diffing both
    endpoints' output for the same product IDs.

    getCubeMetadata's response always includes every dimension member, and a
    handful of cubes (fine-grained census geography, etc.) have tens of
    thousands of them - which can make one batch's response huge and slow to
    generate, independent of how many product IDs are in it. `chunk_size`
    keeps individual requests small, and a chunk that still exceeds
    `chunk_timeout` is skipped (its records keep their coarse data) rather
    than stalling the whole run.
    """
    subjects_by_code = {s["subjectCode"]: s for s in client.get_code_sets()["subject"]}
    product_ids = [r.product_id for r in records]
    total_chunks = -(-len(product_ids) // chunk_size)

    fine_subjects: dict[int, list[CodeRef]] = {}
    fine_dimensions: dict[int, list[DimensionRef]] = {}
    for chunk_num, start in enumerate(range(0, len(product_ids), chunk_size), start=1):
        chunk = product_ids[start : start + chunk_size]
        print(
            f"Fetching cube metadata: batch {chunk_num}/{total_chunks} "
            f"(products {chunk[0]}-{chunk[-1]})"
        )
        try:
            items = client.get_cube_metadata(chunk, timeout=chunk_timeout)
        except httpx.HTTPError as exc:
            print(
                f"  WARNING: batch failed ({exc!r}); "
                f"keeping coarse data for these {len(chunk)} products"
            )
            continue

        for item in items:
            if item["status"] != "SUCCESS":
                continue
            obj = item["object"]
            product_id = int(obj["productId"])

            seen_codes: set[str] = set()
            subjects: list[CodeRef] = []
            for code in obj.get("subjectCode") or []:
                for ancestor_code in _subject_ancestor_codes(code):
                    if ancestor_code in seen_codes:
                        continue
                    subject = subjects_by_code.get(ancestor_code)
                    if subject is not None:
                        seen_codes.add(ancestor_code)
                        subjects.append(
                            CodeRef(
                                code=ancestor_code,
                                en=subject["subjectEn"],
                                fr=subject["subjectFr"],
                            )
                        )
            fine_subjects[product_id] = subjects

            dimensions = []
            for d in obj.get("dimension") or []:
                values_en, values_fr = _near_root_member_names(d.get("member") or [])
                dimensions.append(
                    DimensionRef(
                        name_en=d["dimensionNameEn"],
                        name_fr=d["dimensionNameFr"],
                        position=d["dimensionPositionId"],
                        has_uom=d["hasUom"],
                        values_en=values_en,
                        values_fr=values_fr,
                    )
                )
            fine_dimensions[product_id] = dimensions

    return [
        replace(
            record,
            subjects=fine_subjects.get(record.product_id, record.subjects),
            dimensions=fine_dimensions.get(record.product_id, record.dimensions),
        )
        for record in records
    ]


def _to_record(
    cube: dict[str, Any],
    subjects_by_code: dict[str, dict[str, Any]],
    surveys_by_code: dict[str, dict[str, Any]],
    frequency_by_code: dict[int, dict[str, Any]],
) -> CatalogueRecord:
    freq = frequency_by_code.get(cube["frequencyCode"])
    frequency = (
        CodeRef(
            code=str(cube["frequencyCode"]),
            en=freq["frequencyDescEn"],
            fr=freq["frequencyDescFr"],
        )
        if freq
        else None
    )

    subjects = []
    for code in cube.get("subjectCode") or []:
        subject = subjects_by_code.get(code)
        if subject is not None:
            subjects.append(CodeRef(code=code, en=subject["subjectEn"], fr=subject["subjectFr"]))

    surveys = []
    for code in cube.get("surveyCode") or []:
        survey = surveys_by_code.get(code)
        if survey is not None:
            surveys.append(CodeRef(code=code, en=survey["surveyEn"], fr=survey["surveyFr"]))

    dimensions = [
        DimensionRef(
            name_en=d["dimensionNameEn"],
            name_fr=d["dimensionNameFr"],
            position=d["dimensionPositionId"],
            has_uom=d["hasUOM"],
        )
        for d in cube.get("dimensions") or []
    ]

    return CatalogueRecord(
        product_id=cube["productId"],
        cansim_id=cube.get("cansimId") or None,
        title_en=cube["cubeTitleEn"],
        title_fr=cube["cubeTitleFr"],
        cube_start_date=cube.get("cubeStartDate"),
        cube_end_date=cube.get("cubeEndDate"),
        issue_date=cube.get("issueDate"),
        release_time=cube.get("releaseTime"),
        archived=cube.get("archived") == "1",
        frequency=frequency,
        subjects=subjects,
        surveys=surveys,
        dimensions=dimensions,
    )
