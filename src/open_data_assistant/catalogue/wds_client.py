"""Thin client for Statistics Canada's Web Data Service (WDS) REST API.

Scoped to catalogue-building needs (getAllCubesList, getCodeSets, getCubeMetadata). The
general-purpose client for the MCP tools (get_table_structure, find_members, get_data) is a
separate, fixture-tested client - see tickets #1/#2.

API reference: https://www.statcan.gc.ca/en/developers/wds/user-guide
"""

from __future__ import annotations

import ssl
from typing import Any

import httpx

BASE_URL = "https://www150.statcan.gc.ca/t1/wds/rest"

# getCubeMetadata rejects requests with more than 300 items (error code 9).
MAX_METADATA_BATCH_SIZE = 300


def _default_ssl_context() -> ssl.SSLContext:
    # StatCan's TLS termination silently drops the TLS 1.3 ClientHello emitted by
    # newer OpenSSL builds (observed with OpenSSL 3.5) instead of negotiating
    # down, which hangs until timeout. Capping at TLS 1.2 avoids that.
    context = ssl.create_default_context()
    context.maximum_version = ssl.TLSVersion.TLSv1_2
    return context


class WdsClient:
    def __init__(self, client: httpx.Client | None = None) -> None:
        self._client = client or httpx.Client(
            base_url=BASE_URL, timeout=60.0, verify=_default_ssl_context()
        )

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> WdsClient:
        return self

    def __exit__(self, *exc_info: object) -> None:
        self.close()

    def get_all_cubes_list(self) -> list[dict[str, Any]]:
        """Full inventory of every cube, including per-dimension names (no members)."""
        response = self._client.get("/getAllCubesList")
        response.raise_for_status()
        return response.json()  # type: ignore[no-any-return]

    def get_code_sets(self) -> dict[str, Any]:
        """Lookup tables: subject, survey, frequency, uom, etc."""
        response = self._client.get("/getCodeSets")
        response.raise_for_status()
        payload = response.json()
        if payload["status"] != "SUCCESS":
            raise RuntimeError(f"getCodeSets failed: {payload}")
        return payload["object"]  # type: ignore[no-any-return]

    def get_cube_metadata(
        self, product_ids: list[int], *, timeout: float | None = None
    ) -> list[dict[str, Any]]:
        """Full metadata (including dimension members) for a batch of product IDs.

        At most `MAX_METADATA_BATCH_SIZE` IDs per call - the API rejects larger
        batches outright.

        Some cubes (e.g. fine-grained census geography) have tens of thousands
        of dimension members, so a batch's response size - and the time to
        generate/transfer it - depends heavily on *which* products are in it,
        not just how many. `timeout` overrides the client default for this call.

        Failures for individual product IDs are returned inline (status="FAILED")
        rather than raised, matching the API's per-item response shape.
        """
        response = self._client.post(
            "/getCubeMetadata",
            json=[{"productId": pid} for pid in product_ids],
            timeout=timeout,
        )
        response.raise_for_status()
        return response.json()  # type: ignore[no-any-return]
