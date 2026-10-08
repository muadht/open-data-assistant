from typing import Any

from open_data_assistant.catalogue.catalogue import CodeRef, _to_record, enrich_from_cube_metadata
from open_data_assistant.catalogue.wds_client import WdsClient

CODE_SETS: dict[str, list[dict[str, Any]]] = {
    "subject": [
        {"subjectCode": "35", "subjectEn": "Crime and justice", "subjectFr": "Crime et justice"},
        {
            "subjectCode": "3501",
            "subjectEn": "Crime and justice/Correctional services",
            "subjectFr": "Crime et justice/Services correctionnels",
        },
        {
            "subjectCode": "350102",
            "subjectEn": "Crime and justice/Correctional services/Youth correctional services",
            "subjectFr": (
                "Crime et justice/Services correctionnels/Services correctionnels pour jeunes"
            ),
        },
    ],
    "survey": [
        {"surveyCode": "3313", "surveyEn": "Adult Correctional Services Survey", "surveyFr": "..."},
    ],
    "frequency": [
        {"frequencyCode": 12, "frequencyDescEn": "Annual", "frequencyDescFr": "Annuelle"},
    ],
}


def _index(entries, key):
    return {e[key]: e for e in entries}


SUBJECTS = _index(CODE_SETS["subject"], "subjectCode")
SURVEYS = _index(CODE_SETS["survey"], "surveyCode")
FREQUENCIES = {f["frequencyCode"]: f for f in CODE_SETS["frequency"]}


def make_cube(**overrides):
    cube = {
        "productId": 35100003,
        "cansimId": "251-0008",
        "cubeTitleEn": "Average counts of young persons in correctional services",
        "cubeTitleFr": "Comptes moyens des adolescents",
        "cubeStartDate": "1997-01-01",
        "cubeEndDate": "2023-01-01",
        "issueDate": "2012-08-01T04:00:00Z",
        "releaseTime": "2025-09-23T08:30",
        "frequencyCode": 12,
        "archived": "2",
        "subjectCode": ["3501"],
        "surveyCode": ["3313"],
        "dimensions": [
            {
                "dimensionNameEn": "Geography",
                "dimensionNameFr": "Géographie",
                "dimensionPositionId": 1,
                "hasUOM": False,
            }
        ],
    }
    cube.update(overrides)
    return cube


def test_to_record_maps_current_status():
    record = _to_record(make_cube(archived="2"), SUBJECTS, SURVEYS, FREQUENCIES)
    assert record.archived is False


def test_to_record_maps_archived_status():
    record = _to_record(make_cube(archived="1"), SUBJECTS, SURVEYS, FREQUENCIES)
    assert record.archived is True


def test_to_record_resolves_subject_breadcrumb():
    record = _to_record(make_cube(), SUBJECTS, SURVEYS, FREQUENCIES)
    assert record.subjects == [
        CodeRef(
            code="3501",
            en="Crime and justice/Correctional services",
            fr="Crime et justice/Services correctionnels",
        )
    ]


def test_to_record_resolves_frequency():
    record = _to_record(make_cube(), SUBJECTS, SURVEYS, FREQUENCIES)
    assert record.frequency is not None
    assert record.frequency.en == "Annual"


def test_to_record_skips_unknown_subject_code():
    record = _to_record(make_cube(subjectCode=["99999"]), SUBJECTS, SURVEYS, FREQUENCIES)
    assert record.subjects == []


def test_to_record_preserves_dimensions():
    record = _to_record(make_cube(), SUBJECTS, SURVEYS, FREQUENCIES)
    assert len(record.dimensions) == 1
    assert record.dimensions[0].name_en == "Geography"


class FakeWdsClient(WdsClient):
    """Test double: skips the real httpx client, stubs the two calls used."""

    def __init__(self, code_sets, metadata_items):
        self._code_sets = code_sets
        self._metadata_items = metadata_items

    def get_code_sets(self):
        return self._code_sets

    def get_cube_metadata(self, product_ids, *, timeout=None):
        return self._metadata_items


def make_metadata_dimension(**overrides):
    dimension = {
        "dimensionNameEn": "Geography",
        "dimensionNameFr": "Géographie",
        "dimensionPositionId": 1,
        "hasUom": False,
        "member": [
            {
                "memberId": 1,
                "parentMemberId": None,
                "memberNameEn": "Canada",
                "memberNameFr": "Canada",
            },
            {
                "memberId": 2,
                "parentMemberId": 1,
                "memberNameEn": "Ontario",
                "memberNameFr": "Ontario",
            },
            {
                "memberId": 3,
                "parentMemberId": 2,
                "memberNameEn": "Ottawa",
                "memberNameFr": "Ottawa",
            },
        ],
    }
    dimension.update(overrides)
    return dimension


def test_enrich_replaces_coarse_subjects_with_full_ancestor_chain():
    coarse_record = _to_record(make_cube(subjectCode=["35"]), SUBJECTS, SURVEYS, FREQUENCIES)
    fake_client = FakeWdsClient(
        code_sets=CODE_SETS,
        metadata_items=[
            {
                "status": "SUCCESS",
                "object": {
                    "productId": "35100003",
                    "subjectCode": ["350102"],
                    "dimension": [],
                },
            }
        ],
    )

    [enriched] = enrich_from_cube_metadata([coarse_record], fake_client)

    assert [s.code for s in enriched.subjects] == ["35", "3501", "350102"]


def test_enrich_keeps_original_on_failure():
    coarse_record = _to_record(make_cube(subjectCode=["35"]), SUBJECTS, SURVEYS, FREQUENCIES)
    fake_client = FakeWdsClient(
        code_sets=CODE_SETS,
        metadata_items=[{"status": "FAILED", "object": "product not found"}],
    )

    [result] = enrich_from_cube_metadata([coarse_record], fake_client)

    assert result.subjects == coarse_record.subjects
    assert result.dimensions == coarse_record.dimensions


def test_enrich_keeps_only_near_root_dimension_values():
    coarse_record = _to_record(make_cube(), SUBJECTS, SURVEYS, FREQUENCIES)
    fake_client = FakeWdsClient(
        code_sets=CODE_SETS,
        metadata_items=[
            {
                "status": "SUCCESS",
                "object": {
                    "productId": "35100003",
                    "subjectCode": [],
                    "dimension": [make_metadata_dimension()],
                },
            }
        ],
    )

    [enriched] = enrich_from_cube_metadata([coarse_record], fake_client)

    [dimension] = enriched.dimensions
    assert dimension.values_en == ["Canada", "Ontario"]
    assert "Ottawa" not in dimension.values_en
