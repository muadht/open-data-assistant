"""OpenSearch index mapping for the StatCan product catalogue.

Key decisions: `dimensions` is `nested` (name/values must stay correlated per
dimension - a flat array would let a query for one dimension's value
spuriously match another dimension's name); `subjects`/`surveys` are plain
object arrays since code+text are never combined as a single per-element
constraint; `embedding`'s vector size comes from whatever embedding model is
configured, not hardcoded.
"""

from __future__ import annotations

from typing import Any

from opensearchpy import OpenSearch

_BILINGUAL_TEXT_FIELD = {
    "properties": {
        "en": {"type": "text", "analyzer": "english", "fields": {"raw": {"type": "keyword"}}},
        "fr": {"type": "text", "analyzer": "french", "fields": {"raw": {"type": "keyword"}}},
    }
}

_CODE_REF_FIELD = {
    "properties": {
        "code": {"type": "keyword"},
        "en": {"type": "text", "analyzer": "english", "fields": {"raw": {"type": "keyword"}}},
        "fr": {"type": "text", "analyzer": "french", "fields": {"raw": {"type": "keyword"}}},
    }
}


def build_index_body(embedding_dimension: int) -> dict[str, Any]:
    return {
        "settings": {"index": {"knn": True}},
        "mappings": {
            "properties": {
                "product_id": {"type": "keyword"},
                "cansim_id": {"type": "keyword"},
                "title": _BILINGUAL_TEXT_FIELD,
                "coverage": {
                    "properties": {
                        "start_date": {"type": "date", "format": "yyyy-MM-dd"},
                        "end_date": {"type": "date", "format": "yyyy-MM-dd"},
                    }
                },
                "frequency": {
                    "properties": {
                        "code": {"type": "keyword"},
                        "en": {"type": "keyword"},
                        "fr": {"type": "keyword"},
                    }
                },
                "archived": {"type": "boolean"},
                "issue_date": {"type": "date"},
                "release_time": {"type": "date"},
                "subjects": _CODE_REF_FIELD,
                "surveys": _CODE_REF_FIELD,
                "dimensions": {
                    "type": "nested",
                    "properties": {
                        "name_en": {"type": "text", "fields": {"raw": {"type": "keyword"}}},
                        "name_fr": {"type": "text", "fields": {"raw": {"type": "keyword"}}},
                        "position": {"type": "integer"},
                        "values_en": {"type": "text", "fields": {"raw": {"type": "keyword"}}},
                        "values_fr": {"type": "text", "fields": {"raw": {"type": "keyword"}}},
                    },
                },
                "search_text": {"type": "text", "analyzer": "english"},
                "embedding": {
                    "type": "knn_vector",
                    "dimension": embedding_dimension,
                    "method": {
                        "name": "hnsw",
                        "space_type": "cosinesimil",
                        "engine": "lucene",
                        "parameters": {"ef_construction": 128, "m": 16},
                    },
                },
            }
        },
    }


def ensure_index(client: OpenSearch, index_name: str, embedding_dimension: int) -> None:
    """Create the index with the expected mapping if it doesn't already exist.

    Does not touch (or validate against) an existing index - if the mapping
    needs to change later, that's a deliberate reindex, not something to do
    implicitly on every pipeline run.
    """
    if not client.indices.exists(index=index_name):
        client.indices.create(index=index_name, body=build_index_body(embedding_dimension))
