"""Conversation state per chat session.

The agent holds no state between runs (docs/agent-design.md, "Memory and state"); this keeps
each session's message history and passes it into the next run. In-process only: sessions
don't survive a restart and aren't shared between instances - fine for the MVP, and the
frontend handles the resulting 404 by starting a new conversation (docs/chat-api.md).
"""

from __future__ import annotations

import asyncio
import time
import uuid
from collections.abc import Callable
from dataclasses import dataclass, field

from pydantic_ai.messages import ModelMessage

SESSION_IDLE_SECONDS = 3600.0


@dataclass
class Session:
    id: str
    messages: list[ModelMessage] = field(default_factory=list)
    # Held while a message is being answered, so a second message to the same session gets
    # a 409 instead of racing the first one's history.
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    last_used: float = 0.0
    message_count: int = 0

    def next_message_id(self) -> str:
        self.message_count += 1
        return f"m{self.message_count}"


class SessionStore:
    def __init__(
        self,
        idle_seconds: float = SESSION_IDLE_SECONDS,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._sessions: dict[str, Session] = {}
        self._idle_seconds = idle_seconds
        self._clock = clock

    def create(self) -> Session:
        self._expire()
        session = Session(id=str(uuid.uuid4()), last_used=self._clock())
        self._sessions[session.id] = session
        return session

    def get(self, session_id: str) -> Session | None:
        self._expire()
        session = self._sessions.get(session_id)
        if session is not None:
            session.last_used = self._clock()
        return session

    def _expire(self) -> None:
        now = self._clock()
        for session_id, session in list(self._sessions.items()):
            if not session.lock.locked() and now - session.last_used > self._idle_seconds:
                del self._sessions[session_id]
