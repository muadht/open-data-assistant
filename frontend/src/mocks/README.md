# Mock chat streams

Recorded-style `POST /chat` responses in the format defined in
[docs/chat-api.md](../../../docs/chat-api.md), so the frontend can be built and tested without
the backend running. The stream client (#14) replays one of these when mocking is enabled.

| File                    | Ends with       | Exercises                                                                                                                                        |
| ----------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `answer-single.sse`     | `answer`        | One series, 12 months: a normal answer and a simple line chart                                                                                   |
| `answer-comparison.sse` | `answer`        | Two series (Alberta, Ontario CPI, 13 months); includes a failed tool call the agent recovers from (`ok: false`), which must not show as an error |
| `clarification.sse`     | `clarification` | Options to show as buttons                                                                                                                       |
| `unanswerable.sse`      | `unanswerable`  | A reason plus an alternative                                                                                                                     |
| `error-wds.sse`         | `error`         | WDS maintenance window; the stream ends mid-run after a `tool_call` with no `tool_result`                                                        |

## Using them

Run the dev server with mock mode on:

```bash
VITE_CHAT_MOCK=1 npm run dev
```

The stream client (`src/chat/transport.ts`) then picks a file by the words in your question
and replays it one event at a time: "compare" / "vs" / "Alberta" gives the comparison,
"inflation" the clarification, "census" / "quarter" the unanswerable, "error" /
"maintenance" the error, and anything else the single answer.

`src/chat/events.test.ts` checks every file here against the event format.

The `DataResult`s inside the two answers are real `get_data` output (fetched 2026-10-09), and
both answers pass the backend's output validator. Once #11 works, replace these with
recordings of real streams so they can't drift from what the server sends.
