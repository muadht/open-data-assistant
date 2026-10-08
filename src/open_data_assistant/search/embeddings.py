"""Embedding provider abstraction.

`EmbeddingProvider` is the interface the ingestion pipeline (and the hybrid
search in `hybrid.py`) depends on, so the actual model (local, hosted API,
etc.) is swappable without touching callers, and a fake can be substituted in
tests without loading the real model.
"""

from __future__ import annotations

from typing import Protocol

from .config import EmbeddingConfig


class EmbeddingProvider(Protocol):
    @property
    def dimension(self) -> int: ...

    def embed(self, texts: list[str]) -> list[list[float]]: ...


class SentenceTransformerEmbedder:
    """Local embedding model via `sentence-transformers`. Loaded lazily so
    importing this module (or constructing this class) doesn't pay the
    model-loading cost until it's actually used.
    """

    def __init__(self, config: EmbeddingConfig | None = None) -> None:
        self._model_name = (config or EmbeddingConfig()).model_name
        self._model: object | None = None

    def _load(self) -> object:
        if self._model is None:
            from sentence_transformers import SentenceTransformer

            # Force CPU: MPS (Apple GPU) has been observed to crash this
            # model under concurrent/multi-process callers (e.g. Streamlit).
            # Not worth the risk for a model this small.
            self._model = SentenceTransformer(self._model_name, device="cpu")
        return self._model

    @property
    def dimension(self) -> int:
        model = self._load()
        return model.get_embedding_dimension()  # type: ignore[attr-defined,no-any-return]

    def embed(self, texts: list[str]) -> list[list[float]]:
        model = self._load()
        vectors = model.encode(texts, show_progress_bar=False, convert_to_numpy=True)  # type: ignore[attr-defined]
        return vectors.tolist()  # type: ignore[no-any-return]
