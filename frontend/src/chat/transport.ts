export interface ChatRequest {
  session_id: string | null
  message: string
  /** A table the user picked on the browse page (#56): answer from it. */
  table_id?: number
}

/** Sends a chat request and returns the raw response; swapped for a mock in mock mode and
 * in tests. */
export type ChatTransport = (
  request: ChatRequest,
  signal: AbortSignal,
) => Promise<Response>

export const httpTransport: ChatTransport = (request, signal) =>
  fetch(`${import.meta.env.VITE_API_BASE ?? ''}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal,
  })

const mockStreams = import.meta.glob<string>('../mocks/*.sse', {
  query: '?raw',
  import: 'default',
})

// Keyword routing so each mock can be tried from the UI; see src/mocks/README.md.
const MOCK_ROUTES: [RegExp, string][] = [
  [/provinc|territor|\bmap\b/i, 'answer-provinces'],
  [/compar|\bvs\.?\b|versus|alberta/i, 'answer-comparison'],
  [/inflation/i, 'clarification'],
  [/census|quarter/i, 'unanswerable'],
  [/error|maintenance/i, 'error-wds'],
]

export function pickMock(message: string): string {
  return (
    MOCK_ROUTES.find(([pattern]) => pattern.test(message))?.[1] ??
    'answer-single'
  )
}

/** Replays a mock stream one event at a time, with a short pause between events so the
 * progress steps are visible, like a real run. */
export function createMockTransport(delayMs = 400): ChatTransport {
  return async (request, signal) => {
    const load = mockStreams[`../mocks/${pickMock(request.message)}.sse`]
    const text = await load()
    const events = text.split(/(?<=\n\n)/)
    const encoder = new TextEncoder()
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        for (const event of events) {
          if (signal.aborted) break
          await new Promise((resolve) => setTimeout(resolve, delayMs))
          controller.enqueue(encoder.encode(event))
        }
        controller.close()
      },
    })
    return new Response(body, {
      headers: { 'Content-Type': 'text/event-stream' },
    })
  }
}
