"""build_app's configuration from the environment (#89)."""

from __future__ import annotations

import pytest

from open_data_assistant.agent.agent import build_agent
from open_data_assistant.api.app import thinking_from_env


@pytest.mark.parametrize(
    ("value", "level"),
    [(None, None), ("", None), ("default", None), ("low", "low"), (" High ", "high")],
)
def test_thinking_level_from_env(value: str | None, level: str | None) -> None:
    assert thinking_from_env(value) == level


def test_an_unknown_thinking_level_stops_startup() -> None:
    with pytest.raises(ValueError, match="OPEN_DATA_ASSISTANT_THINKING='fast'"):
        thinking_from_env("fast")


def test_the_thinking_level_reaches_the_model_settings() -> None:
    assert build_agent("test", thinking="low").model_settings == {"thinking": "low"}
    assert build_agent("test").model_settings is None
