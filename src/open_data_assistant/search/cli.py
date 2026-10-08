"""Command-line entrypoint to ingest catalogue.json into OpenSearch."""

from __future__ import annotations

import argparse
import logging
from pathlib import Path

from .pipeline import run


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--catalogue",
        type=Path,
        default=Path("data/catalogue.json"),
        help="Path to the catalogue JSON from `build-catalogue` (default: data/catalogue.json)",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Only ingest the first N records (for a quick sample run before the full catalogue)",
    )
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    for noisy_logger in ("httpx", "httpcore", "huggingface_hub", "urllib3", "opensearch"):
        logging.getLogger(noisy_logger).setLevel(logging.WARNING)

    run(args.catalogue, limit=args.limit)


if __name__ == "__main__":
    main()
