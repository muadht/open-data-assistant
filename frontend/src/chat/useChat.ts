import { useCallback, useEffect, useReducer, useRef } from 'react'
import { chatReducer, initialChatState } from './chatState'
import { runChat } from './runChat'
import {
  createMockTransport,
  httpTransport,
  type ChatTransport,
} from './transport'

// VITE_CHAT_MOCK=1 replays src/mocks/*.sse instead of calling the backend.
const defaultTransport: ChatTransport =
  import.meta.env.VITE_CHAT_MOCK === '1' ? createMockTransport() : httpTransport

/** Chat state plus `send` and `stop`. All the logic lives in chatReducer and runChat; this
 * only wires them to React. */
export function useChat(transport: ChatTransport = defaultTransport) {
  const [state, dispatch] = useReducer(chatReducer, initialChatState)
  const controllerRef = useRef<AbortController | null>(null)

  const send = useCallback(
    (text: string) => {
      const message = text.trim()
      if (!message || state.isStreaming) return
      const controller = new AbortController()
      controllerRef.current = controller
      dispatch({
        type: 'send',
        userId: crypto.randomUUID(),
        assistantId: crypto.randomUUID(),
        text: message,
      })
      void runChat(
        transport,
        { session_id: state.sessionId, message },
        dispatch,
        controller.signal,
      )
    },
    [transport, state.isStreaming, state.sessionId],
  )

  const stop = useCallback(() => controllerRef.current?.abort(), [])

  useEffect(() => () => controllerRef.current?.abort(), [])

  return { ...state, send, stop }
}
