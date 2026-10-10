import type {
  AnswerEvent,
  ChatEvent,
  ClarificationEvent,
  ErrorEvent,
  UnanswerableEvent,
} from './events'

export interface Step {
  callId: string
  label: string
  tool?: string
  /** One line on what the step found, shown under it (e.g. the top matching table). */
  detail?: string
  /** undefined while running; false means it failed and the agent retried (not an error). */
  ok?: boolean
}

export type Outcome =
  | { kind: 'answer'; answer: AnswerEvent }
  | { kind: 'clarification'; clarification: ClarificationEvent }
  | { kind: 'unanswerable'; unanswerable: UnanswerableEvent }
  | {
      kind: 'error'
      error: Pick<ErrorEvent, 'message' | 'retryable'> & {
        /** The user pressed Stop: their action, not a failure, so shown as such. */
        stopped?: boolean
      }
    }

export interface UserMessage {
  role: 'user'
  id: string
  text: string
}

export interface AssistantMessage {
  role: 'assistant'
  id: string
  messageId?: string
  steps: Step[]
  /** Set once the stream's terminal event (or a failure) arrives. */
  outcome?: Outcome
}

export type ChatMessage = UserMessage | AssistantMessage

export interface ChatState {
  sessionId: string | null
  messages: ChatMessage[]
  isStreaming: boolean
}

export const initialChatState: ChatState = {
  sessionId: null,
  messages: [],
  isStreaming: false,
}

export type ChatAction =
  | { type: 'send'; userId: string; assistantId: string; text: string }
  | { type: 'event'; event: ChatEvent }
  | {
      type: 'fail'
      message: string
      retryable: boolean
      /** Drop the session, e.g. after a 404 because the server restarted. */
      resetSession?: boolean
      stopped?: boolean
    }
  | { type: 'end' }
  /** New chat: forget the conversation and its session. */
  | { type: 'reset' }
  /** Switch to an earlier chat (#76): its messages, and its session to continue. */
  | { type: 'restore'; state: ChatState }

export const CUT_OFF_MESSAGE = "I couldn't finish that answer."

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'send':
      return {
        ...state,
        isStreaming: true,
        messages: [
          ...state.messages,
          { role: 'user', id: action.userId, text: action.text },
          { role: 'assistant', id: action.assistantId, steps: [] },
        ],
      }
    case 'event':
      return applyEvent(state, action.event)
    case 'reset':
      return initialChatState
    case 'restore':
      return { ...action.state, isStreaming: false }
    case 'fail':
      return {
        ...updateCurrent(state, (m) => ({
          ...m,
          outcome: m.outcome ?? {
            kind: 'error',
            error: {
              message: action.message,
              retryable: action.retryable,
              stopped: action.stopped,
            },
          },
        })),
        sessionId: action.resetSession ? null : state.sessionId,
        isStreaming: false,
      }
    case 'end':
      // A stream that closes without a terminal event was cut off (docs/chat-api.md).
      return {
        ...updateCurrent(state, (m) =>
          m.outcome
            ? m
            : {
                ...m,
                outcome: {
                  kind: 'error',
                  error: { message: CUT_OFF_MESSAGE, retryable: true },
                },
              },
        ),
        isStreaming: false,
      }
  }
}

function applyEvent(state: ChatState, event: ChatEvent): ChatState {
  switch (event.type) {
    case 'session':
      return {
        ...updateCurrent(state, (m) => ({
          ...m,
          messageId: event.data.message_id,
        })),
        sessionId: event.data.session_id,
      }
    case 'tool_call':
      return updateCurrent(state, (m) => ({
        ...m,
        steps: [
          ...m.steps,
          {
            callId: event.data.call_id,
            label: event.data.label,
            tool: event.data.tool,
          },
        ],
      }))
    case 'tool_result':
      return updateCurrent(state, (m) => ({
        ...m,
        steps: m.steps.map((s) =>
          s.callId === event.data.call_id
            ? { ...s, ok: event.data.ok, detail: event.data.detail }
            : s,
        ),
      }))
    case 'answer':
      return finish(state, { kind: 'answer', answer: event.data })
    case 'clarification':
      return finish(state, {
        kind: 'clarification',
        clarification: event.data,
      })
    case 'unanswerable':
      return finish(state, { kind: 'unanswerable', unanswerable: event.data })
    case 'error':
      return finish(state, {
        kind: 'error',
        error: { message: event.data.message, retryable: event.data.retryable },
      })
  }
}

function finish(state: ChatState, outcome: Outcome): ChatState {
  return {
    ...updateCurrent(state, (m) => ({ ...m, outcome })),
    isStreaming: false,
  }
}

/** Applies `update` to the assistant message currently being answered (always the last). */
function updateCurrent(
  state: ChatState,
  update: (message: AssistantMessage) => AssistantMessage,
): ChatState {
  const last = state.messages.at(-1)
  if (last?.role !== 'assistant') return state
  return { ...state, messages: [...state.messages.slice(0, -1), update(last)] }
}
