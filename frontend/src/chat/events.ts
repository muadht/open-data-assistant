// Event shapes for POST /chat, hand-kept in sync with docs/chat-api.md (the source of truth)
// and the backend's models in src/open_data_assistant/agent/outcomes.py and mcp/schemas.py.
// The mock streams in src/mocks/ are checked against these types in events.test.ts, and get
// replaced with recordings of the real server once #11 exists - that's what catches drift.

export interface DataPoint {
  ref_per: string
  value: number | null
  uom: string
  scalar_factor_applied: boolean
  status: string
  symbol: string | null
  security_level: string
  decimals: number
  release_time: string
}

export interface DataResult {
  product_id: number
  title_en: string
  series_title_en: string
  members: Record<string, string>
  footnotes: string[]
  coordinate: string
  vector_id: number | null
  series: DataPoint[]
  source_url: string
  series_url: string | null
  retrieved_at: string
}

/** A catalogue table, as returned by search_tables (mcp/schemas.py TableCandidate). */
export interface TableCandidate {
  product_id: number
  title_en: string
  subjects: string[]
  frequency: string
  date_range: { start: string; end: string }
  is_active: boolean
  score: number
}

export interface UsedValue {
  coordinate: string
  ref_per: string
  value: number | null
}

export interface SessionEvent {
  session_id: string
  message_id: string
}

export interface ToolCallEvent {
  call_id: string
  label: string
}

export interface ToolResultEvent {
  call_id: string
  ok: boolean
  message?: string
}

export interface AnswerEvent {
  message_id: string
  text: string
  values: UsedValue[]
  data_results: DataResult[]
  /** Other tables that may interest the user (#54); absent from older servers. */
  related_tables?: TableCandidate[]
}

export interface ClarificationEvent {
  message_id: string
  question: string
  options: string[]
}

export interface UnanswerableEvent {
  message_id: string
  reason: string
  alternative: string | null
}

export type ErrorCode =
  | 'wds_unavailable'
  | 'validation_failed'
  | 'limit_exceeded'
  | 'timeout'
  | 'internal'

export interface ErrorEvent {
  message_id: string
  code: ErrorCode
  message: string
  retryable: boolean
}

export type ChatEvent =
  | { type: 'session'; data: SessionEvent }
  | { type: 'tool_call'; data: ToolCallEvent }
  | { type: 'tool_result'; data: ToolResultEvent }
  | { type: 'answer'; data: AnswerEvent }
  | { type: 'clarification'; data: ClarificationEvent }
  | { type: 'unanswerable'; data: UnanswerableEvent }
  | { type: 'error'; data: ErrorEvent }

export const TERMINAL_EVENTS = [
  'answer',
  'clarification',
  'unanswerable',
  'error',
] as const

const KNOWN_EVENTS = new Set<string>([
  'session',
  'tool_call',
  'tool_result',
  ...TERMINAL_EVENTS,
])

/** Returns the typed event, or null for an unknown event type - which the frontend must
 * ignore rather than fail on (docs/chat-api.md, "Compatibility rules"). */
export function toChatEvent(type: string, data: unknown): ChatEvent | null {
  if (!KNOWN_EVENTS.has(type)) return null
  return { type, data } as ChatEvent
}
