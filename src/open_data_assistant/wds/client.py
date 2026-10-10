"""General-purpose client for the StatCan WDS API.

Used by the get_table_structure, find_members, and get_data MCP tools (tickets #3-#5). Not
the same client as `open_data_assistant.catalogue.wds_client.WdsClient`, which is scoped to
catalogue-building calls only (getAllCubesList, getCodeSets, getCubeMetadata) and has no
need for the retry/rate-limiting behavior a live chat agent's request pattern needs.

API reference: https://www.statcan.gc.ca/en/developers/wds/user-guide
See docs/mcp-tools-and-data-contract.md's "WDS quirks" section for why each piece of this
exists - every behavior here is backed by a fixture in tests/fixtures/wds/.
"""

from __future__ import annotations

import time
from threading import Lock
from typing import Any

import httpx

BASE_URL = "https://www150.statcan.gc.ca/t1/wds/rest"

# One observed cold-start lookup took ~64s, then ~0.3s on repeat - a generous read timeout
# avoids mistaking a slow WDS response for a hung request.
_TIMEOUT = httpx.Timeout(connect=10.0, read=120.0, write=10.0, pool=10.0)
_MAX_RETRIES = 3
_RETRY_BACKOFF_SECONDS = 2.0

# 25 requests/second per IP, per WDS's documented limit - centralized here so no combination
# of concurrent MCP tool calls from this process can exceed it.
_MAX_REQUESTS_PER_SECOND = 25


class WdsError(Exception):
    """Base class for WDS errors that are real failures, not a SUCCESS/FAILED item."""


class WdsMaintenanceWindow(WdsError):
    """HTTP 409 - StatCan is updating this table (midnight-8:30 AM ET)."""

    def __init__(self) -> None:
        super().__init__(
            "WDS is updating this table (maintenance window, midnight-8:30 AM ET) - "
            "try again shortly."
        )


class WdsInvalidRequest(WdsError):
    """HTTP 406 - a malformed (non-10-slot) coordinate, or vectorId 0 / non-positive latestN."""


class _RateLimiter:
    """Blocks callers so no more than `max_per_second` requests go out in any rolling
    1-second window. Naive (not a token bucket) - good enough for a single process well
    under the documented limit; not distributed-safe across multiple processes/instances."""

    def __init__(self, max_per_second: int) -> None:
        self._max_per_second = max_per_second
        self._lock = Lock()
        self._timestamps: list[float] = []

    def wait(self) -> None:
        with self._lock:
            now = time.monotonic()
            self._timestamps = [t for t in self._timestamps if now - t < 1.0]
            if len(self._timestamps) >= self._max_per_second:
                sleep_for = 1.0 - (now - self._timestamps[0])
                if sleep_for > 0:
                    time.sleep(sleep_for)
                now = time.monotonic()
                self._timestamps = [t for t in self._timestamps if now - t < 1.0]
            self._timestamps.append(time.monotonic())


class WdsClient:
    def __init__(
        self,
        client: httpx.Client | None = None,
        *,
        max_retries: int = _MAX_RETRIES,
        retry_backoff_seconds: float = _RETRY_BACKOFF_SECONDS,
    ) -> None:
        self._client = client or httpx.Client(base_url=BASE_URL, timeout=_TIMEOUT)
        self._rate_limiter = _RateLimiter(_MAX_REQUESTS_PER_SECOND)
        self._max_retries = max_retries
        self._retry_backoff_seconds = retry_backoff_seconds

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> WdsClient:
        return self

    def __exit__(self, *exc_info: object) -> None:
        self.close()

    def _request(
        self,
        method: str,
        path: str,
        *,
        json_body: Any = None,
        params: dict[str, Any] | None = None,
    ) -> Any:
        last_exc: Exception | None = None
        for attempt in range(1, self._max_retries + 1):
            self._rate_limiter.wait()
            try:
                response = self._client.request(method, path, json=json_body, params=params)
            except (httpx.TimeoutException, httpx.ConnectError) as exc:
                last_exc = exc
                if attempt < self._max_retries:
                    time.sleep(self._retry_backoff_seconds * attempt)
                    continue
                raise

            if response.status_code == 409:
                raise WdsMaintenanceWindow()
            if response.status_code == 406:
                try:
                    message = response.json().get("message", "invalid request")
                except ValueError:
                    message = "invalid request"
                raise WdsInvalidRequest(message)
            if response.status_code >= 500:
                last_exc = httpx.HTTPStatusError(
                    f"HTTP {response.status_code} from WDS",
                    request=response.request,
                    response=response,
                )
                if attempt < self._max_retries:
                    time.sleep(self._retry_backoff_seconds * attempt)
                    continue
                raise last_exc

            response.raise_for_status()
            return response.json()

        raise last_exc  # type: ignore[misc]  # unreachable: every branch above returns or raises

    # ---------------------------------------------------------------------------- endpoints

    def get_cube_metadata(self, product_ids: list[int]) -> list[dict[str, Any]]:
        return self._request(  # type: ignore[no-any-return]
            "POST", "/getCubeMetadata", json_body=[{"productId": pid} for pid in product_ids]
        )

    def get_code_sets(self) -> dict[str, Any]:
        payload = self._request("GET", "/getCodeSets")
        if payload["status"] != "SUCCESS":
            raise WdsError(f"getCodeSets failed: {payload}")
        return payload["object"]  # type: ignore[no-any-return]

    def get_series_info_from_cube_pid_coord(
        self, items: list[tuple[int, str]]
    ) -> list[dict[str, Any]]:
        return self._request(  # type: ignore[no-any-return]
            "POST",
            "/getSeriesInfoFromCubePidCoord",
            json_body=[{"productId": pid, "coordinate": coord} for pid, coord in items],
        )

    def get_series_info_from_vector(self, vector_ids: list[int]) -> list[dict[str, Any]]:
        return self._request(  # type: ignore[no-any-return]
            "POST",
            "/getSeriesInfoFromVector",
            json_body=[{"vectorId": vid} for vid in vector_ids],
        )

    def get_data_from_cube_pid_coord_and_latest_n_periods(
        self, items: list[tuple[int, str, int]]
    ) -> list[dict[str, Any]]:
        return self._request(  # type: ignore[no-any-return]
            "POST",
            "/getDataFromCubePidCoordAndLatestNPeriods",
            json_body=[
                {"productId": pid, "coordinate": coord, "latestN": n} for pid, coord, n in items
            ],
        )

    def get_data_from_vectors_and_latest_n_periods(
        self, items: list[tuple[int, int]]
    ) -> list[dict[str, Any]]:
        return self._request(  # type: ignore[no-any-return]
            "POST",
            "/getDataFromVectorsAndLatestNPeriods",
            json_body=[{"vectorId": vid, "latestN": n} for vid, n in items],
        )

    def get_data_from_vector_by_reference_period_range(
        self, vector_ids: list[int], *, start_ref_period: str, end_reference_period: str
    ) -> list[dict[str, Any]]:
        """Several vector IDs in one call was live-verified 2026-10-09; results don't come
        back in request order. WDS's own asymmetric parameter naming (startRefPeriod vs.
        endReferencePeriod) is deliberate - that's genuinely how the endpoint is spelled, not
        a typo."""
        return self._request(  # type: ignore[no-any-return]
            "GET",
            "/getDataFromVectorByReferencePeriodRange",
            params={
                "vectorIds": ",".join(str(v) for v in vector_ids),
                "startRefPeriod": start_ref_period,
                "endReferencePeriod": end_reference_period,
            },
        )
