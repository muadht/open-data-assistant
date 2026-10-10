"""The system prompt names DataResult fields for the model to cite - if one is renamed, the
prompt would point the model at a field that no longer exists without anything failing."""

from __future__ import annotations

import pytest

from open_data_assistant.agent.system_prompt import SYSTEM_PROMPT
from open_data_assistant.mcp.schemas import DataResult


@pytest.mark.parametrize("field", ["series_url", "source_url"])
def test_citation_fields_named_in_the_prompt_exist_on_data_result(field: str) -> None:
    assert field in SYSTEM_PROMPT
    assert field in DataResult.model_fields
