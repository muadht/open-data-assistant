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
# avoids mistaking a slow WDS response for a hung request. The pool timeout is as long, since
# a request may wait for one of the few connections (below) while another is slow.
_TIMEOUT = httpx.Timeout(connect=10.0, read=120.0, write=10.0, pool=120.0)

# At most this many requests in flight to WDS at once; more wait for a free connection. Three
# simultaneous requests failed live with TLS handshake timeouts, two worked (2026-10-10) - and
# the agent runs parallel tool calls concurrently, so without a cap they'd collide.
_MAX_CONNECTIONS = 2
_MAX_RETRIES = 3
_RETRY_BACKOFF_SECONDS = 2.0

# 25 requests/second per IP, per WDS's documented limit - centralized here so no combination
# of concurrent MCP tool calls from this process can exceed it.
_MAX_REQUESTS_PER_SECOND = 25

# Table metadata only changes when StatCan releases (8:30 AM ET), so an hour is safely fresh
# while still picking up a release the same morning.
_METADATA_TTL_SECONDS = 3600.0


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
        metadata_ttl_seconds: float = _METADATA_TTL_SECONDS,
    ) -> None:
        self._client = client or httpx.Client(
            base_url=BASE_URL,
            timeout=_TIMEOUT,
            limits=httpx.Limits(
                max_connections=_MAX_CONNECTIONS, max_keepalive_connections=_MAX_CONNECTIONS
            ),
        )
        self._rate_limiter = _RateLimiter(_MAX_REQUESTS_PER_SECOND)
        self._max_retries = max_retries
        self._retry_backoff_seconds = retry_backoff_seconds
        self._metadata_ttl_seconds = metadata_ttl_seconds
        self._cache_lock = Lock()
        self._code_sets: dict[str, Any] | None = None
        self._cube_metadata: dict[int, tuple[float, dict[str, Any]]] = {}

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
        """Cached per product for `metadata_ttl_seconds`; only SUCCESS items are cached."""
        now = time.monotonic()
        with self._cache_lock:
            items = {
                pid: item
                for pid, (fetched_at, item) in self._cube_metadata.items()
                if pid in product_ids and now - fetched_at < self._metadata_ttl_seconds
            }
        missing = [pid for pid in product_ids if pid not in items]
        if missing:
            fetched: list[dict[str, Any]] = self._request(
                "POST", "/getCubeMetadata", json_body=[{"productId": pid} for pid in missing]
            )
            succeeded = {
                int(item["object"]["productId"]): item
                for item in fetched
                if item["status"] == "SUCCESS"
            }
            # WDS doesn't guarantee response order (live-verified for batched series lookups),
            # and a FAILED item carries only a message - so successes are matched by
            # productId and failures fill the remaining product IDs in order.
            failed = iter(item for item in fetched if item["status"] != "SUCCESS")
            with self._cache_lock:
                for pid in missing:
                    if pid in succeeded:
                        items[pid] = succeeded[pid]
                        self._cube_metadata[pid] = (now, succeeded[pid])
                    elif (failure := next(failed, None)) is not None:
                        items[pid] = failure
                    else:
                        raise WdsError(f"getCubeMetadata returned no item for product {pid}")
        return [items[pid] for pid in product_ids]

    def get_code_sets(self) -> dict[str, Any]:
        """Cached for the client's lifetime - code sets are static lookup tables."""
        with self._cache_lock:
            if self._code_sets is not None:
                return self._code_sets
        payload = self._request("GET", "/getCodeSets")
        if payload["status"] != "SUCCESS":
            raise WdsError(f"getCodeSets failed: {payload}")
        code_sets: dict[str, Any] = payload["object"]
        with self._cache_lock:
            self._code_sets = code_sets
        return code_sets

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
