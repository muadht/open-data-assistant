import pytest

from open_data_assistant.search.documents import build_search_text, to_opensearch_document


def make_record(**overrides):
    record = {
        "product_id": 35100003,
        "cansim_id": "251-0008",
        "title_en": "Average counts of young persons in correctional services",
        "title_fr": "Comptes moyens des adolescents",
        "cube_start_date": "1997-01-01T05:00:00Z",
        "cube_end_date": "2023-01-01T05:00:00Z",
        "issue_date": "2021-04-13T04:00:00Z",
        "release_time": "2025-09-23T12:30:00Z",
        "archived": False,
        "frequency": {"code": "12", "en": "Annual", "fr": "Annuelle"},
        "subjects": [{"code": "35", "en": "Crime and justice", "fr": "Crime et justice"}],
        "surveys": [{"code": "3313", "en": "Corrections Report", "fr": "..."}],
        "dimensions": [
            {
                "name_en": "Geography",
                "name_fr": "Géographie",
                "position": 1,
                "has_uom": False,
                "values_en": ["Canada", "Ontario"],
                "values_fr": ["Canada", "Ontario"],
            }
        ],
    }
    record.update(overrides)
    return record


def test_to_opensearch_document_maps_core_fields():
    doc = to_opensearch_document(make_record())
    assert doc["product_id"] == "35100003"
    assert doc["cansim_id"] == "251-0008"
    assert doc["title"] == {
        "en": "Average counts of young persons in correctional services",
        "fr": "Comptes moyens des adolescents",
    }
    assert doc["archived"] is False


def test_to_opensearch_document_normalizes_coverage_to_date_only():
    doc = to_opensearch_document(make_record())
    assert doc["coverage"] == {"start_date": "1997-01-01", "end_date": "2023-01-01"}


def test_to_opensearch_document_handles_missing_coverage_dates():
    doc = to_opensearch_document(make_record(cube_start_date=None, cube_end_date=None))
    assert doc["coverage"] == {"start_date": None, "end_date": None}


def test_to_opensearch_document_drops_has_uom_and_keeps_values():
    doc = to_opensearch_document(make_record())
    [dimension] = doc["dimensions"]
    assert "has_uom" not in dimension
    assert dimension["values_en"] == ["Canada", "Ontario"]


def test_to_opensearch_document_defaults_missing_dimension_values():
    record = make_record()
    del record["dimensions"][0]["values_en"]
    del record["dimensions"][0]["values_fr"]
    doc = to_opensearch_document(record)
    assert doc["dimensions"][0]["values_en"] == []


def test_to_opensearch_document_includes_embedding_when_given():
    doc = to_opensearch_document(make_record(), embedding=[0.1, 0.2])
    assert doc["embedding"] == [0.1, 0.2]


def test_to_opensearch_document_omits_embedding_when_not_given():
    doc = to_opensearch_document(make_record())
    assert "embedding" not in doc


def test_to_opensearch_document_raises_on_malformed_record():
    record = make_record()
    del record["title_en"]
    with pytest.raises(KeyError):
        to_opensearch_document(record)


def test_build_search_text_includes_title_subjects_surveys_and_dimension_values():
    text = build_search_text(make_record())
    assert "Average counts of young persons in correctional services" in text
    assert "Crime and justice" in text
    assert "Corrections Report" in text
    assert "Geography" in text
    assert "Ontario" in text
