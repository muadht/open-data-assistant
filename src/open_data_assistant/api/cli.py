"""`uv run api`: serves the chat API on http://localhost:8010 (the frontend's dev server
proxies `/chat` there)."""

from __future__ import annotations

import logging
import os

import uvicorn


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    uvicorn.run(
        "open_data_assistant.api.app:build_app",
        factory=True,
        host=os.environ.get("API_HOST", "127.0.0.1"),
        port=int(os.environ.get("API_PORT", "8010")),
    )
