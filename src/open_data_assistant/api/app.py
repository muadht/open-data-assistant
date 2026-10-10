"""The FastAPI app (ticket #11). `create_app` takes the agent and a deps factory so tests can
inject a scripted model and mocked clients; `build_app` wires the real ones from env."""

from __future__ import annotations

import logging
import os
from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic_ai import Agent
from pydantic_ai.usage import UsageLimits

from ..agent.agent import DEFAULT_RUN_TIMEOUT_SECONDS, DEFAULT_USAGE_LIMITS, build_agent
from ..agent.deps import AgentDeps
from ..agent.outcomes import Outcome
from ..search.config import EmbeddingConfig, OpenSearchConfig
from ..search.embeddings import SentenceTransformerEmbedder
from ..search.pipeline import make_client
from ..wds.client import WdsClient
from .chat import MAX_MESSAGE_LENGTH, ChatRequest, chat_events
from .sessions import SessionStore
from .tables import router as tables_router

logger = logging.getLogger(__name__)

DEFAULT_MODEL = "openai:gpt-5-mini"


def create_app(
    agent: Agent[AgentDeps, Outcome],
    make_deps: Callable[[], AgentDeps],
    *,
    sessions: SessionStore | None = None,
    usage_limits: UsageLimits = DEFAULT_USAGE_LIMITS,
    timeout_seconds: float = DEFAULT_RUN_TIMEOUT_SECONDS,
) -> FastAPI:
    store = sessions or SessionStore()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        # Created once and shared by every request: one WDS rate limiter and metadata cache
        # per process (#40), and the MCP endpoint (#47) can mount into this same app.
        deps = make_deps()
        app.state.deps = deps
        try:
            yield
        finally:
            deps.wds_client.close()

    app = FastAPI(title="Open Data Assistant", lifespan=lifespan)

    @app.exception_handler(RequestValidationError)
    async def bad_request(request: Request, exc: RequestValidationError) -> JSONResponse:
        # docs/chat-api.md specifies 400 with a readable detail, not FastAPI's default 422.
        if request.url.path != "/chat":
            fields = ", ".join(str(e["loc"][-1]) for e in exc.errors())
            return JSONResponse(status_code=400, content={"detail": f"Invalid {fields}."})
        return JSONResponse(
            status_code=400,
            content={
                "detail": "Send a JSON body with a non-empty `message` of at most "
                f"{MAX_MESSAGE_LENGTH} characters, an optional `session_id` and an optional "
                "`table_id`."
            },
        )

    @app.post("/chat")
    async def chat(request: ChatRequest, http_request: Request) -> StreamingResponse:
        if request.session_id is None:
            session = store.create()
        else:
            found = store.get(request.session_id)
            if found is None:
                raise HTTPException(404, "This conversation has expired or doesn't exist.")
            session = found
        if session.lock.locked():
            raise HTTPException(409, "This conversation is still answering a message.")
        # Uncontended, so this takes the lock without yielding to another request between
        # the check above and here; chat_events releases it when the stream ends.
        await session.lock.acquire()
        events = chat_events(
            agent,
            http_request.app.state.deps,
            session,
            request.message,
            usage_limits=usage_limits,
            timeout_seconds=timeout_seconds,
            table_id=request.table_id,
        )
        return StreamingResponse(
            events,
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    app.include_router(tables_router)
    return app


def build_app() -> FastAPI:
    """The real app: model from OPEN_DATA_ASSISTANT_MODEL (default gpt-5-mini), the
    provider's API key (e.g. OPENAI_API_KEY) and OpenSearch settings from env / `.env`."""
    load_dotenv()
    model = os.environ.get("OPEN_DATA_ASSISTANT_MODEL", DEFAULT_MODEL)
    logger.info("Using model %s", model)

    def make_deps() -> AgentDeps:
        opensearch = OpenSearchConfig.from_env()
        return AgentDeps(
            wds_client=WdsClient(),
            search_client=make_client(opensearch),
            search_index=opensearch.index_name,
            embedder=SentenceTransformerEmbedder(EmbeddingConfig.from_env()),
        )

    return create_app(build_agent(model), make_deps)
