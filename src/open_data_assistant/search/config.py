"""Configuration for the OpenSearch connection and embedding model.

All settings are overridable via environment variables so the pipeline can
point at different clusters/models without code changes.
"""

from __future__ import annotations

import os
from dataclasses import dataclass

DEFAULT_INDEX_NAME = "statcan-products"
DEFAULT_EMBEDDING_MODEL = "sentence-transformers/all-MiniLM-L6-v2"


@dataclass(frozen=True)
class OpenSearchConfig:
    host: str = "localhost"
    port: int = 9200
    use_ssl: bool = False
    verify_certs: bool = False
    username: str | None = None
    password: str | None = None
    index_name: str = DEFAULT_INDEX_NAME

    @classmethod
    def from_env(cls) -> OpenSearchConfig:
        return cls(
            host=os.environ.get("OPENSEARCH_HOST", "localhost"),
            port=int(os.environ.get("OPENSEARCH_PORT", "9200")),
            use_ssl=os.environ.get("OPENSEARCH_USE_SSL", "false").lower() == "true",
            verify_certs=os.environ.get("OPENSEARCH_VERIFY_CERTS", "false").lower() == "true",
            username=os.environ.get("OPENSEARCH_USERNAME") or None,
            password=os.environ.get("OPENSEARCH_PASSWORD") or None,
            index_name=os.environ.get("OPENSEARCH_INDEX", DEFAULT_INDEX_NAME),
        )


@dataclass(frozen=True)
class EmbeddingConfig:
    model_name: str = DEFAULT_EMBEDDING_MODEL

    @classmethod
    def from_env(cls) -> EmbeddingConfig:
        return cls(model_name=os.environ.get("EMBEDDING_MODEL", DEFAULT_EMBEDDING_MODEL))
