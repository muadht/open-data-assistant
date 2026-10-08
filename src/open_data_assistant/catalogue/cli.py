"""Command-line entrypoint to build and dump the StatCan catalogue as JSON."""

from __future__ import annotations

import json
from pathlib import Path

from .catalogue import build_catalogue, enrich_from_cube_metadata
from .wds_client import WdsClient

DEFAULT_OUTPUT = Path("data/catalogue.json")


def main() -> None:
    DEFAULT_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with WdsClient() as client:
        records = build_catalogue(client)
        records = enrich_from_cube_metadata(records, client)

    DEFAULT_OUTPUT.write_text(
        json.dumps([r.to_dict() for r in records], indent=2, ensure_ascii=False)
    )
    print(f"Wrote {len(records)} product records to {DEFAULT_OUTPUT}")


if __name__ == "__main__":
    main()
