"""Bulk-index documents into OpenSearch."""

from __future__ import annotations

from typing import Any

from opensearchpy import OpenSearch, helpers


def bulk_index(
    client: OpenSearch, index_name: str, documents: list[tuple[str, dict[str, Any]]]
) -> tuple[int, list[Any]]:
    """Bulk-index (doc_id, document) pairs. Uses the "index" action (upsert
    by _id), so re-running with the same product_id overwrites rather than
    duplicating - the pipeline is safe to rerun.

    Returns (success_count, errors) - errors are the raw failures from the
    bulk API, not raised, so a partial failure doesn't lose the rest of the
    batch's successes.
    """
    actions = (
        {"_index": index_name, "_id": doc_id, "_source": source} for doc_id, source in documents
    )
    success, errors = helpers.bulk(client, actions, stats_only=False, raise_on_error=False)
    return success, list(errors)
