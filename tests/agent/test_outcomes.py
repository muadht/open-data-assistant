"""Tests for the typed outcomes, output validator, and run limits (ticket #48) - scripted
FunctionModels and httpx-mocked WDS, never a live LLM. Reuses the scripting helpers from
test_agent.py the way test_server.py reuses test_search_tables' fakes.
"""

from __future__ import annotations

from typing import Any

import pytest
from pydantic_ai.exceptions import UnexpectedModelBehavior, UsageLimitExceeded
from pydantic_ai.messages import ModelMessage, ModelRequest, RetryPromptPart
from pydantic_ai.usage import UsageLimits
from pytest_httpx import HTTPXMock

from open_data_assistant.agent.agent import Answer, Clarification, Unanswerable, build_agent
from open_data_assistant.wds.client import WdsMaintenanceWindow
from tests.agent.test_agent import (
    ONTARIO_ANSWER,
    ONTARIO_ANSWER_ARGS,
    Step,
    _deps,
    _mock,
    _scripted_model,
)

ONTARIO_SELECTIONS = {1: 7, 2: 7, 3: 1, 4: 1, 5: 1, 6: 1}
FETCH_ONTARIO: Step = (
    "get_data",
    {
        "product_id": 14100287,
        "selections": ONTARIO_SELECTIONS,
        "period": {"type": "latestN", "n": 1},
    },
)


def _mock_ontario(httpx_mock: HTTPXMock) -> None:
    _mock(httpx_mock, "POST", "getCubeMetadata", "cube_metadata")
    _mock(httpx_mock, "GET", "getCodeSets", "code_sets")
    _mock(httpx_mock, "POST", "getSeriesInfoFromCubePidCoord", "normal_series_info")
    _mock(httpx_mock, "POST", "getDataFromVectorsAndLatestNPeriods", "normal_data_point")


def _answer(text: str, **value_overrides: Any) -> Step:
    [value] = ONTARIO_ANSWER_ARGS["values"]
    return "final_result_Answer", {"text": text, "values": [{**value, **value_overrides}]}


def _retry_reasons(messages: list[ModelMessage]) -> list[str]:
    return [
        str(part.content)
        for message in messages
        if isinstance(message, ModelRequest)
        for part in message.parts
        if isinstance(part, RetryPromptPart)
    ]


def _run(httpx_mock: HTTPXMock, steps: list[Step]) -> Any:
    _mock_ontario(httpx_mock)
    agent = build_agent(_scripted_model(steps))
    deps = _deps()
    with deps.wds_client:
        return agent.run_sync("What's the unemployment rate in Ontario?", deps=deps)


def test_clarification_outcome_needs_no_data() -> None:
    steps: list[Step] = [
        (
            "final_result_Clarification",
            {
                "question": "Which inflation measure do you mean?",
                "options": ["CPI, all-items", "CPI, 12-month change"],
            },
        )
    ]
    agent = build_agent(_scripted_model(steps))
    deps = _deps()
    with deps.wds_client:
        result = agent.run_sync("What's inflation?", deps=deps)

    assert isinstance(result.output, Clarification)
    assert len(result.output.options) == 2


def test_unanswerable_outcome_needs_no_data() -> None:
    steps: list[Step] = [
        (
            "final_result_Unanswerable",
            {
                "reason": "Census tables have no vector IDs, so a quarterly range isn't possible.",
                "alternative": "The 2016 and 2021 census-year snapshots.",
            },
        )
    ]
    agent = build_agent(_scripted_model(steps))
    deps = _deps()
    with deps.wds_client:
        result = agent.run_sync("Ontario census population by quarter, 2016-2021", deps=deps)

    assert isinstance(result.output, Unanswerable)
    assert result.output.alternative


def test_answer_with_no_values_is_sent_back() -> None:
    steps: list[Step] = [
        ("final_result_Answer", {"text": "Unemployment is about 6% these days.", "values": []}),
        ("final_result_Unanswerable", {"reason": "No data was fetched."}),
    ]
    agent = build_agent(_scripted_model(steps))
    deps = _deps()
    with deps.wds_client:
        result = agent.run_sync("What's the unemployment rate?", deps=deps)

    assert isinstance(result.output, Unanswerable)
    [reason] = _retry_reasons(result.all_messages())
    assert "at least one value" in reason


def test_untraceable_value_is_sent_back_then_corrected(httpx_mock: HTTPXMock) -> None:
    wrong = _answer(ONTARIO_ANSWER_ARGS["text"].replace("6.9% [1]", "7.0% [1]"), value=7.0)
    result = _run(httpx_mock, [FETCH_ONTARIO, wrong, ONTARIO_ANSWER])

    assert isinstance(result.output, Answer)
    assert result.output.values[0].value == 6.9
    [reason] = _retry_reasons(result.all_messages())
    assert "7.0 for coordinate 7.7.1.1.1.1.0.0.0.0 at 2026-08-01 does not appear" in reason


def test_a_plain_answer_without_links_passes(httpx_mock: HTTPXMock) -> None:
    """Sources are shown by the app from the answer's data, so the text needn't link them
    (APP_INSTRUCTIONS); the value is still checked against fetched data."""
    plain = _answer("The unemployment rate in Ontario was 6.9% [1] in August 2026.")
    result = _run(httpx_mock, [FETCH_ONTARIO, plain])

    assert isinstance(result.output, Answer)
    assert _retry_reasons(result.all_messages()) == []


def test_urls_in_the_text_are_sent_back(httpx_mock: HTTPXMock) -> None:
    """The app shows each source beneath the answer, so links in the text are clutter -
    rejected in code, whatever the prompt does (#11)."""
    linked = _answer(
        "The unemployment rate in Ontario was 6.9% [1] in August 2026 "
        "([v2063949](https://www150.statcan.gc.ca/t1/tbl1/en/sbv.action?vectorNumbers=v2063949))."
    )
    result = _run(httpx_mock, [FETCH_ONTARIO, linked, ONTARIO_ANSWER])

    assert isinstance(result.output, Answer)
    [reason] = _retry_reasons(result.all_messages())
    assert "Remove the URLs" in reason


def test_citation_markers_must_match_the_values(httpx_mock: HTTPXMock) -> None:
    """Each number is followed by [n], its position in `values` (#63): an unknown marker
    and an uncited value are both sent back."""
    miscited = _answer("The unemployment rate in Ontario was 6.9% [2] in August 2026.")
    result = _run(httpx_mock, [FETCH_ONTARIO, miscited, ONTARIO_ANSWER])

    assert isinstance(result.output, Answer)
    [reason] = _retry_reasons(result.all_messages())
    assert "Citation marker [2] doesn't match any value - there are 1" in reason
    assert "missing: [1]" in reason


def test_missing_reference_period_is_sent_back(httpx_mock: HTTPXMock) -> None:
    undated = _answer("The unemployment rate in Ontario is 6.9% [1].")
    result = _run(httpx_mock, [FETCH_ONTARIO, undated, ONTARIO_ANSWER])

    [reason] = _retry_reasons(result.all_messages())
    assert "reference period 2026-08-01" in reason


def test_suppressed_value_must_be_named(httpx_mock: HTTPXMock) -> None:
    _mock(httpx_mock, "POST", "getCubeMetadata", "suppressed_cube_metadata")
    _mock(httpx_mock, "GET", "getCodeSets", "code_sets")
    _mock(httpx_mock, "POST", "getSeriesInfoFromCubePidCoord", "suppressed_series_info")
    _mock(httpx_mock, "POST", "getDataFromVectorsAndLatestNPeriods", "suppressed_value")
    value = {"coordinate": "1.1.1.1.0.0.0.0.0.0", "ref_per": "2026-06-01", "value": None}
    steps: list[Step] = [
        (
            "get_data",
            {
                "product_id": 13100778,
                "selections": {1: 1, 2: 1, 3: 1, 4: 1},
                "period": {"type": "latestN", "n": 1},
            },
        ),
        (
            "final_result_Answer",
            {
                "text": "No value [1] is available for June 2026.",
                "values": [value],
            },
        ),
        (
            "final_result_Answer",
            {
                "text": "The June 2026 value [1] is suppressed: StatCan flags it as too "
                "unreliable to be published.",
                "values": [value],
            },
        ),
    ]
    agent = build_agent(_scripted_model(steps))
    deps = _deps()
    with deps.wds_client:
        result = agent.run_sync("Latest value?", deps=deps)

    assert isinstance(result.output, Answer)
    assert result.output.values[0].value is None
    [reason] = _retry_reasons(result.all_messages())
    assert "flagged 'too unreliable to be published'" in reason


def test_retry_budget_exhausted_fails_visibly(httpx_mock: HTTPXMock) -> None:
    undated = _answer("The unemployment rate in Ontario is 6.9% [1].")
    with pytest.raises(UnexpectedModelBehavior, match="Exceeded maximum output retries"):
        _run(httpx_mock, [FETCH_ONTARIO, undated, undated, undated])


def test_tool_call_limit_stops_a_spinning_run(httpx_mock: HTTPXMock) -> None:
    _mock(httpx_mock, "POST", "getCubeMetadata", "cube_metadata")
    _mock(httpx_mock, "GET", "getCodeSets", "code_sets")
    steps: list[Step] = [("get_table_structure", {"product_id": 14100287})] * 4
    agent = build_agent(_scripted_model(steps))
    deps = _deps()
    with deps.wds_client, pytest.raises(UsageLimitExceeded):
        agent.run_sync("Loop forever", deps=deps, usage_limits=UsageLimits(tool_calls_limit=2))


def test_wds_maintenance_window_stops_the_run(httpx_mock: HTTPXMock) -> None:
    """A WDS outage is not something the model can fix by retrying with different
    arguments, so it propagates out of the run rather than becoming a ModelRetry."""
    httpx_mock.add_response(
        method="POST",
        url="https://www150.statcan.gc.ca/t1/wds/rest/getCubeMetadata",
        status_code=409,
    )
    agent = build_agent(_scripted_model([("get_table_structure", {"product_id": 14100287})]))
    deps = _deps()
    with deps.wds_client, pytest.raises(WdsMaintenanceWindow):
        agent.run_sync("What's the unemployment rate in Ontario?", deps=deps)
