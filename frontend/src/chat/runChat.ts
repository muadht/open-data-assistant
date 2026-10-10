import type { ChatAction } from './chatState'
import { CUT_OFF_MESSAGE } from './chatState'
import { toChatEvent } from './events'
import { parseSse } from './sse'
import type { ChatRequest, ChatTransport } from './transport'

export const STOPPED_MESSAGE = 'Stopped.'

/** Sends one message and dispatches an action per stream event. Kept free of React so it
 * can be tested with a fake transport and a plain array as the dispatch target. */
export async function runChat(
  transport: ChatTransport,
  request: ChatRequest,
  dispatch: (action: ChatAction) => void,
  signal: AbortSignal,
): Promise<void> {
  const fail = (message: string, retryable = true, resetSession = false) =>
    dispatch({ type: 'fail', message, retryable, resetSession })

  let response: Response
  try {
    response = await transport(request, signal)
  } catch {
    fail(
      signal.aborted
        ? STOPPED_MESSAGE
        : "Couldn't reach the server. Check your connection and try again.",
    )
    return
  }

  if (!response.ok) {
    if (response.status === 404 && request.session_id) {
      fail(
        'This conversation has expired. Please send your question again to start a new one.',
        true,
        true,
      )
    } else if (response.status === 409) {
      fail('Still answering your previous question. Please wait a moment.')
    } else {
      fail(await errorDetail(response))
    }
    return
  }
  if (!response.body) {
    fail(CUT_OFF_MESSAGE)
    return
  }

  try {
    for await (const message of parseSse(response.body)) {
      let data: unknown
      try {
        data = JSON.parse(message.data)
      } catch {
        continue
      }
      const event = toChatEvent(message.event, data)
      if (event) dispatch({ type: 'event', event })
    }
  } catch {
    fail(signal.aborted ? STOPPED_MESSAGE : CUT_OFF_MESSAGE)
    return
  }
  dispatch({ type: 'end' })
}

async function errorDetail(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json()
    if (
      body &&
      typeof body === 'object' &&
      'detail' in body &&
      typeof body.detail === 'string'
    ) {
      return body.detail
    }
  } catch {
    // Not JSON - fall through to the generic message.
  }
  return `Something went wrong (HTTP ${response.status}). Please try again.`
}
