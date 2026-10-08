"""Orchestrates catalogue.json -> normalize -> embed -> bulk index into OpenSearch."""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from opensearchpy import OpenSearch

from .config import EmbeddingConfig, OpenSearchConfig
from .documents import to_opensearch_document
from .embeddings import EmbeddingProvider, SentenceTransformerEmbedder
from .indexer import bulk_index
from .schema import ensure_index

logger = logging.getLogger(__name__)

# Documents per embedding batch (and per bulk-index call, one-to-one).
BATCH_SIZE = 64


def load_catalogue(path: Path, *, limit: int | None = None) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = json.loads(path.read_text())
    return records[:limit] if limit is not None else records


def make_client(config: OpenSearchConfig) -> OpenSearch:
    auth = (config.username, config.password) if config.username else None
    return OpenSearch(
        hosts=[{"host": config.host, "port": config.port}],
        http_auth=auth,
        use_ssl=config.use_ssl,
        verify_certs=config.verify_certs,
    )


def run(
    catalogue_path: Path,
    *,
    limit: int | None = None,
    opensearch_config: OpenSearchConfig | None = None,
    embedder: EmbeddingProvider | None = None,
    client: OpenSearch | None = None,
) -> None:
    opensearch_config = opensearch_config or OpenSearchConfig.from_env()
    embedder = embedder or SentenceTransformerEmbedder(EmbeddingConfig.from_env())
    client = client or make_client(opensearch_config)

    logger.info("Loading catalogue from %s", catalogue_path)
    records = load_catalogue(catalogue_path, limit=limit)
    logger.info("Loaded %d records%s", len(records), f" (limit={limit})" if limit else "")

    logger.info(
        "Ensuring index %r exists (embedding dim=%d)",
        opensearch_config.index_name,
        embedder.dimension,
    )
    ensure_index(client, opensearch_config.index_name, embedder.dimension)

    total_indexed = 0
    total_skipped = 0
    total_errors = 0

    for batch_start in range(0, len(records), BATCH_SIZE):
        batch = records[batch_start : batch_start + BATCH_SIZE]

        doc_ids: list[str] = []
        docs: list[dict[str, Any]] = []
        texts: list[str] = []
        for record in batch:
            try:
                doc = to_opensearch_document(record)
            except (KeyError, TypeError) as exc:
                total_skipped += 1
                logger.warning(
                    "Skipping malformed record (product_id=%r): %r",
                    record.get("product_id"),
                    exc,
                )
                continue
            doc_ids.append(doc["product_id"])
            docs.append(doc)
            texts.append(doc["search_text"])

        if not docs:
            continue

        for doc, embedding in zip(docs, embedder.embed(texts), strict=True):
            doc["embedding"] = embedding

        pairs = list(zip(doc_ids, docs, strict=True))
        success, errors = bulk_index(client, opensearch_config.index_name, pairs)
        total_indexed += success
        total_errors += len(errors)
        if errors:
            logger.warning("Batch had %d indexing errors, e.g.: %s", len(errors), errors[0])

        logger.info(
            "Progress: %d/%d records (%d indexed, %d skipped, %d errors)",
            min(batch_start + BATCH_SIZE, len(records)),
            len(records),
            total_indexed,
            total_skipped,
            total_errors,
        )

    logger.info(
        "Done: %d indexed, %d skipped (malformed), %d indexing errors",
        total_indexed,
        total_skipped,
        total_errors,
    )
