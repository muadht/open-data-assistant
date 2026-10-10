// Drift check: every mock stream must follow docs/chat-api.md and these TypeScript types.
// Once the mocks are recordings of the real server (#11), this also checks the server.
import { describe, expect, it } from 'vitest'
import { TERMINAL_EVENTS } from './events'
import { parseSse } from './sse'

const mocks = import.meta.glob<string>('../mocks/*.sse', {
  query: '?raw',
  import: 'default',
  eager: true,
})

// Required fields per event type - keep in step with events.ts and docs/chat-api.md.
const REQUIRED: Record<string, string[]> = {
  session: ['session_id', 'message_id'],
  tool_call: ['call_id', 'label'],
  tool_result: ['call_id', 'ok'],
  answer: ['message_id', 'text', 'values', 'data_results'],
  clarification: ['message_id', 'question', 'options'],
  unanswerable: ['message_id', 'reason', 'alternative'],
  error: ['message_id', 'code', 'message', 'retryable'],
}

const DATA_RESULT_FIELDS = [
  'product_id',
  'title_en',
  'series_title_en',
  'members',
  'footnotes',
  'coordinate',
  'vector_id',
  'series',
  'source_url',
  'series_url',
  'retrieved_at',
]

async function events(text: string) {
  const stream = new Response(text).body!
  const parsed: { type: string; data: Record<string, unknown> }[] = []
  for await (const m of parseSse(stream)) {
    parsed.push({ type: m.event, data: JSON.parse(m.data) })
  }
  return parsed
}

describe.each(Object.entries(mocks))('%s', (_name, text) => {
  it('starts with session and ends with exactly one terminal event', async () => {
    const parsed = await events(text)
    expect(parsed[0].type).toBe('session')
    const terminal = parsed.filter((e) =>
      (TERMINAL_EVENTS as readonly string[]).includes(e.type),
    )
    expect(terminal).toHaveLength(1)
    expect(parsed.at(-1)).toBe(terminal[0])
  })

  it('uses only known event types, each with its required fields', async () => {
    for (const { type, data } of await events(text)) {
      expect(Object.keys(REQUIRED)).toContain(type)
      for (const field of REQUIRED[type]) expect(data).toHaveProperty(field)
    }
  })

  it('answers carry complete DataResults for every value', async () => {
    for (const { type, data } of await events(text)) {
      if (type !== 'answer') continue
      const results = data.data_results as Record<string, unknown>[]
      for (const result of results) {
        for (const field of DATA_RESULT_FIELDS)
          expect(result).toHaveProperty(field)
      }
      const coordinates = results.map((r) => r.coordinate)
      for (const value of data.values as { coordinate: string }[]) {
        expect(coordinates).toContain(value.coordinate)
      }
    }
  })
})
