import { describe, expect, it } from 'vitest'
import answerComparison from '../mocks/answer-comparison.sse?raw'
import answerSingle from '../mocks/answer-single.sse?raw'
import clarification from '../mocks/clarification.sse?raw'
import errorWds from '../mocks/error-wds.sse?raw'
import unanswerable from '../mocks/unanswerable.sse?raw'
import {
  chatReducer,
  CUT_OFF_MESSAGE,
  initialChatState,
  type AssistantMessage,
  type ChatAction,
  type ChatState,
} from './chatState'
import { runChat, STOPPED_MESSAGE } from './runChat'
import { pickMock, type ChatTransport } from './transport'

function respondWith(
  body: string | null,
  init: ResponseInit = {},
): ChatTransport {
  return async () => new Response(body, init)
}

async function send(
  transport: ChatTransport,
  state: ChatState = initialChatState,
  signal = new AbortController().signal,
): Promise<ChatState> {
  let next = chatReducer(state, {
    type: 'send',
    userId: 'u',
    assistantId: 'a',
    text: 'question',
  })
  const dispatch = (action: ChatAction) => {
    next = chatReducer(next, action)
  }
  await runChat(
    transport,
    { session_id: state.sessionId, message: 'question' },
    dispatch,
    signal,
  )
  return next
}

function reply(state: ChatState): AssistantMessage {
  const last = state.messages.at(-1)
  if (last?.role !== 'assistant') throw new Error('no assistant message')
  return last
}

describe('runChat with the mock streams', () => {
  it('single answer: session, steps, and the answer with its data', async () => {
    const state = await send(respondWith(answerSingle))
    const message = reply(state)
    expect(state.sessionId).toBe('mock-session')
    expect(state.isStreaming).toBe(false)
    expect(message.messageId).toBe('m1')
    expect(message.steps.map((s) => s.ok)).toEqual([true, true, true, true])
    expect(message.outcome?.kind).toBe('answer')
    if (message.outcome?.kind !== 'answer') return
    expect(message.outcome.answer.data_results).toHaveLength(1)
    expect(message.outcome.answer.data_results[0].series).toHaveLength(12)
  })

  it('comparison: a failed step is kept as progress, not turned into an error', async () => {
    const message = reply(await send(respondWith(answerComparison)))
    expect(message.steps.map((s) => s.ok)).toEqual([true, true, false, true])
    expect(message.outcome?.kind).toBe('answer')
    if (message.outcome?.kind !== 'answer') return
    expect(
      message.outcome.answer.data_results.map((r) => r.members.Geography),
    ).toEqual(['Alberta', 'Ontario'])
  })

  it('clarification', async () => {
    const message = reply(await send(respondWith(clarification)))
    expect(message.outcome?.kind).toBe('clarification')
    if (message.outcome?.kind !== 'clarification') return
    expect(message.outcome.clarification.options).toHaveLength(3)
  })

  it('unanswerable', async () => {
    const message = reply(await send(respondWith(unanswerable)))
    expect(message.outcome?.kind).toBe('unanswerable')
  })

  it('error event: shown as an error, with the step left unfinished', async () => {
    const message = reply(await send(respondWith(errorWds)))
    expect(message.outcome).toEqual({
      kind: 'error',
      error: {
        message:
          "Statistics Canada's data service is updating (midnight to 8:30 AM ET). Try again shortly.",
        retryable: true,
      },
    })
    expect(message.steps.at(-1)?.ok).toBeUndefined()
  })
})

describe('runChat failures', () => {
  it('a stream cut off before its terminal event becomes an error', async () => {
    const cut = answerSingle.slice(0, answerSingle.indexOf('event: answer'))
    const message = reply(await send(respondWith(cut)))
    expect(message.outcome).toEqual({
      kind: 'error',
      error: { message: CUT_OFF_MESSAGE, retryable: true },
    })
  })

  it('unknown event types and malformed data are ignored', async () => {
    const noisy =
      'event: text_delta\ndata: {"delta": "future event"}\n\n' +
      'event: tool_call\ndata: not json\n\n' +
      clarification
    const message = reply(await send(respondWith(noisy)))
    expect(message.outcome?.kind).toBe('clarification')
  })

  it('a non-2xx response shows the server detail', async () => {
    const transport = respondWith(
      JSON.stringify({ detail: 'Message too long.' }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      },
    )
    const message = reply(await send(transport))
    expect(message.outcome).toEqual({
      kind: 'error',
      error: { message: 'Message too long.', retryable: true },
    })
  })

  it('a 404 for a known session drops the session', async () => {
    const withSession = { ...initialChatState, sessionId: 'expired' }
    const state = await send(respondWith(null, { status: 404 }), withSession)
    expect(state.sessionId).toBeNull()
    expect(reply(state).outcome?.kind).toBe('error')
  })

  it('a network failure becomes an error, not a hang', async () => {
    const state = await send(async () => {
      throw new TypeError('Failed to fetch')
    })
    expect(state.isStreaming).toBe(false)
    expect(reply(state).outcome?.kind).toBe('error')
  })

  it('stopping the request says so', async () => {
    const controller = new AbortController()
    controller.abort()
    const state = await send(
      async (_request, signal) => {
        signal.throwIfAborted()
        return new Response(answerSingle)
      },
      initialChatState,
      controller.signal,
    )
    expect(reply(state).outcome).toEqual({
      kind: 'error',
      error: { message: STOPPED_MESSAGE, retryable: true },
    })
  })
})

describe('pickMock', () => {
  it.each([
    ["What's the unemployment rate in Ontario?", 'answer-single'],
    ['How does Ontario compare with Alberta?', 'answer-comparison'],
    ["What's inflation?", 'clarification'],
    ['Ontario census population by quarter', 'unanswerable'],
    ['show me an error', 'error-wds'],
  ])('%s -> %s', (message, expected) => {
    expect(pickMock(message)).toBe(expected)
  })
})

describe('the answer as a draft while it is written (#91)', () => {
  function sse(event: string, data: object): string {
    return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  }
  const session = sse('session', { session_id: 's', message_id: 'm1' })
  const delta = (text: string) =>
    sse('answer_delta', { message_id: 'm1', text })

  it('keeps the latest text as a draft until the stream ends', async () => {
    // Cut off after the deltas: the draft goes and the cut-off error takes its place.
    const state = await send(
      respondWith(session + delta('Ontario') + delta('Ontario was 6.9% [1]')),
    )
    const message = reply(state)
    expect(message.draft).toBeUndefined()
    expect(message.outcome).toMatchObject({
      kind: 'error',
      error: { message: CUT_OFF_MESSAGE },
    })
  })

  it('a new draft replaces the old one, and "" clears it (a retry)', () => {
    let state = chatReducer(initialChatState, {
      type: 'send',
      userId: 'u',
      assistantId: 'a',
      text: 'q',
    })
    const apply = (text: string) =>
      (state = chatReducer(state, {
        type: 'event',
        event: { type: 'answer_delta', data: { message_id: 'm1', text } },
      }))
    apply('Wrong 7.0% [1]')
    expect(reply(state).draft).toBe('Wrong 7.0% [1]')
    apply('')
    expect(reply(state).draft).toBeUndefined()
    apply('Right')
    expect(reply(state).draft).toBe('Right')
  })

  it('the validated answer replaces the draft', async () => {
    const withDraft = answerSingle.replace(
      'event: answer\n',
      delta('Ontario was') + 'event: answer\n',
    )
    const state = await send(respondWith(withDraft))
    const message = reply(state)
    expect(message.draft).toBeUndefined()
    expect(message.outcome?.kind).toBe('answer')
  })
})
