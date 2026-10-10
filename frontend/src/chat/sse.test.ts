import { describe, expect, it } from 'vitest'
import { parseSse, type SseMessage } from './sse'

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
}

async function collect(chunks: string[]): Promise<SseMessage[]> {
  const messages: SseMessage[] = []
  for await (const m of parseSse(streamOf(chunks))) messages.push(m)
  return messages
}

const TWO_EVENTS =
  'event: tool_call\ndata: {"call_id": "c1", "label": "Fetching data for Québec"}\n\n' +
  'event: tool_result\ndata: {"call_id": "c1", "ok": true}\n\n'

describe('parseSse', () => {
  it('parses whole events', async () => {
    expect(await collect([TWO_EVENTS])).toEqual([
      {
        event: 'tool_call',
        data: '{"call_id": "c1", "label": "Fetching data for Québec"}',
      },
      { event: 'tool_result', data: '{"call_id": "c1", "ok": true}' },
    ])
  })

  it('reassembles events split at every byte boundary', async () => {
    // Splitting the encoded bytes (not the string) also splits "é" mid-character.
    const bytes = new TextEncoder().encode(TWO_EVENTS)
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const byte of bytes) controller.enqueue(new Uint8Array([byte]))
        controller.close()
      },
    })
    const messages: SseMessage[] = []
    for await (const m of parseSse(stream)) messages.push(m)
    expect(messages).toEqual(await collect([TWO_EVENTS]))
  })

  it('handles \\r\\n line endings split across chunks', async () => {
    const crlf = TWO_EVENTS.replace(/\n/g, '\r\n')
    const cut = crlf.indexOf('\r\n\r\n') + 1 // chunk ends between \r and \n
    expect(await collect([crlf.slice(0, cut), crlf.slice(cut)])).toEqual(
      await collect([TWO_EVENTS]),
    )
  })

  it('joins multi-line data and ignores comments', async () => {
    expect(
      await collect([': keep-alive\n\nevent: x\ndata: a\ndata: b\n\n']),
    ).toEqual([{ event: 'x', data: 'a\nb' }])
  })

  it('drops an incomplete final event', async () => {
    expect(await collect(['event: answer\ndata: {"text": "partial'])).toEqual(
      [],
    )
  })
})
