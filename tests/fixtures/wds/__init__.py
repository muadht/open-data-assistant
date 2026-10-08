"""Loader for recorded WDS fixtures.

Each fixture in this directory is a JSON file shaped
`{"description", "captured_at", "source", "request", "http_status", "body"}`. `source` is
either "live" (captured against the real API - see each fixture's `request`/`captured_at`
for exactly what produced it) or "constructed" (matches a real, documented shape that can't
be triggered on demand - a genuinely suppressed value or the midnight-8:30am ET maintenance
window). See CLAUDE.md's "no live WDS calls in tests" rule for why these exist at all.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

_FIXTURES_DIR = Path(__file__).parent

FIXTURE_NAMES = (
    "normal_data_point",
    "normal_series_info",
    "census_series_info",
    "census_data_point",
    "nonexistent_coordinate",
    "malformed_coordinate_406",
    "vector_zero_406",
    "suppressed_value",
    "suppressed_series_info",
    "maintenance_window_409",
    "cube_metadata",
    "code_sets",
    "range_data_point",
    "gdp_series_info",
    "gdp_data_point",
    "census_cube_metadata",
    "gdp_cube_metadata",
    "suppressed_cube_metadata",
)


def load_wds_fixture(name: str) -> dict[str, Any]:
    """Load a recorded fixture by name (without the .json extension).

    Returns the full envelope - most callers only need `["http_status"]` and `["body"]` to
    feed into a pytest-httpx mocked response.
    """
    path = _FIXTURES_DIR / f"{name}.json"
    return json.loads(path.read_text())  # type: ignore[no-any-return]
