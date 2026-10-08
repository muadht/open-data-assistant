"""Ticket #9 - LLM provider validation spike.

Runs a real model against every row of docs/question-catalogue-eval.xlsx through the real
agent (ticket #8) and real WDS, and reports per-row results plus a summary.

Scope note: `search_tables` needs a running OpenSearch instance, which this repo deliberately
doesn't run yet (see CLAUDE.md's Docker note). This spike therefore measures tool-calling
reliability and answer accuracy for get_table_structure -> find_members -> get_data, given the
row's expected product_id up front in the prompt (as if a prior search_tables call had already
resolved it) - it does NOT measure retrieval accuracy. The two exceptions are deliberate: row
14 (disambiguation) withholds the product_id, since the whole point is there isn't one right
answer; row 15 (negative case) supplies it, to test that the agent declines the unanswerable
range request rather than approximating.

This is a spike, not a test: it makes real WDS calls and real (billed) LLM calls. It is not
run by `pytest` and never will be - do not import this module from tests/.

Usage:
    uv run python scripts/llm_provider_spike.py [--model openai:gpt-5-mini] [--rows 1,5,9]

Requires OPENAI_API_KEY in a local .env (gitignored, see .env.example) or the environment.
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import openpyxl
from dotenv import load_dotenv
from pydantic_ai import Agent
from pydantic_ai.messages import ModelResponse, TextPart, ToolCallPart, ToolReturnPart

from open_data_assistant.agent.deps import AgentDeps
from open_data_assistant.agent.system_prompt import SYSTEM_PROMPT
from open_data_assistant.agent.tools import find_members, get_data, get_table_structure
from open_data_assistant.mcp.schemas import DataResult
from open_data_assistant.wds.client import WdsClient

CATALOGUE_PATH = Path(__file__).resolve().parent.parent / "docs" / "question-catalogue-eval.xlsx"
RESULTS_DIR = Path(__file__).resolve().parent.parent / "data" / "spike-results"

# Rows where the agent must NOT be handed a product_id - the point of the row is that there
# isn't a single right one, so giving it away would make the test meaningless.
WITHHOLD_PRODUCT_ID_ROWS = {14}


@dataclass
class EvalRow:
    id: int
    category: str
    question: str
    case_type: str
    expected_product_id: int | str
    expected_value: str
    expected_unit: str
    notes: str


@dataclass
class RowResult:
    row: EvalRow
    final_answer: str
    tool_calls: list[tuple[str, dict[str, Any]]] = field(default_factory=list)
    data_results: list[DataResult] = field(default_factory=list)
    error: str | None = None


def load_eval_rows() -> list[EvalRow]:
    wb = openpyxl.load_workbook(CATALOGUE_PATH, data_only=True)
    ws = wb["Question Catalogue"]
    rows = list(ws.iter_rows(values_only=True))
    header, data_rows = rows[0], rows[1:]
    index = {name: i for i, name in enumerate(header)}
    rows_out = []
    for r in data_rows:
        raw_product_id = r[index["expected_product_id"]]
        rows_out.append(
            EvalRow(
                id=int(r[index["id"]]),  # type: ignore[arg-type]
                category=str(r[index["category"]]),
                question=str(r[index["question"]]),
                case_type=str(r[index["case_type"]]),
                expected_product_id=(
                    raw_product_id if isinstance(raw_product_id, int) else str(raw_product_id)
                ),
                expected_value=str(r[index["expected_value"]]),
                expected_unit=str(r[index["expected_unit"]]),
                notes=str(r[index["notes"]]),
            )
        )
    return rows_out


def _build_prompt(row: EvalRow) -> str:
    if row.id in WITHHOLD_PRODUCT_ID_ROWS or not isinstance(row.expected_product_id, int):
        return row.question
    return (
        f"{row.question}\n\n"
        f"(A prior table search already confirmed product ID {row.expected_product_id} is the "
        "right table for this - use get_table_structure on it to proceed. Do not call "
        "search_tables.)"
    )


def _build_spike_agent(model: str) -> Agent[AgentDeps, str]:
    """Same wiring as agent.build_agent(), minus search_tables - see module docstring for why."""
    agent: Agent[AgentDeps, str] = Agent(model, deps_type=AgentDeps, instructions=SYSTEM_PROMPT)
    agent.tool(get_table_structure)
    agent.tool(find_members)
    agent.tool(get_data)
    return agent


def run_row(row: EvalRow, model: str) -> RowResult:
    agent = _build_spike_agent(model)

    with WdsClient() as wds_client:
        deps = AgentDeps(
            wds_client=wds_client,
            search_client=_UnreachableSearchClient(),
            search_index="statcan-products",
            embedder=_UnreachableEmbedder(),
        )
        try:
            result = agent.run_sync(_build_prompt(row), deps=deps)
        except Exception as exc:  # noqa: BLE001 - a spike script surfaces every failure mode
            return RowResult(row=row, final_answer="", error=f"{type(exc).__name__}: {exc}")

    tool_calls: list[tuple[str, dict[str, Any]]] = []
    data_results: list[DataResult] = []
    for message in result.all_messages():
        if isinstance(message, ModelResponse):
            for part in message.parts:
                if isinstance(part, ToolCallPart):
                    args = (
                        part.args if isinstance(part.args, dict) else json.loads(part.args or "{}")
                    )
                    tool_calls.append((part.tool_name, args))
            continue
        for request_part in message.parts:
            if isinstance(request_part, ToolReturnPart) and request_part.tool_name == "get_data":
                if isinstance(request_part.content, DataResult):
                    data_results.append(request_part.content)

    final_text = ""
    for message in reversed(result.all_messages()):
        if not isinstance(message, ModelResponse):
            continue
        text_parts = [part.content for part in message.parts if isinstance(part, TextPart)]
        if text_parts:
            final_text = text_parts[-1]
            break

    return RowResult(
        row=row, final_answer=final_text, tool_calls=tool_calls, data_results=data_results
    )


class _UnreachableSearchClient:
    def search(self, *, index: str, body: dict[str, Any]) -> dict[str, Any]:
        raise AssertionError("search_tables is not registered for this spike")


class _UnreachableEmbedder:
    dimension = 0

    def embed(self, texts: list[str]) -> list[list[float]]:
        raise AssertionError("search_tables is not registered for this spike")


def main() -> None:
    load_dotenv()

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", default="openai:gpt-5-mini")
    parser.add_argument("--rows", default=None, help="Comma-separated row ids to run, e.g. 1,5,9")
    args = parser.parse_args()

    rows = load_eval_rows()
    if args.rows:
        wanted = {int(r) for r in args.rows.split(",")}
        rows = [r for r in rows if r.id in wanted]

    results = []
    for row in rows:
        print(f"--- row {row.id}: {row.question}", file=sys.stderr)
        result = run_row(row, args.model)
        results.append(result)
        print(f"    -> {result.final_answer[:200] or result.error}", file=sys.stderr)

    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    out_path = (
        RESULTS_DIR / f"{args.model.replace(':', '_')}_{datetime.now(UTC):%Y%m%dT%H%M%SZ}.json"
    )
    out_path.write_text(
        json.dumps(
            [
                {
                    "row_id": r.row.id,
                    "question": r.row.question,
                    "case_type": r.row.case_type,
                    "expected_product_id": r.row.expected_product_id,
                    "expected_value": r.row.expected_value,
                    "final_answer": r.final_answer,
                    "tool_calls": r.tool_calls,
                    "data_results": [d.model_dump(mode="json") for d in r.data_results],
                    "error": r.error,
                }
                for r in results
            ],
            indent=2,
            default=str,
        )
    )
    print(f"\nWrote {out_path}", file=sys.stderr)


if __name__ == "__main__":
    main()
