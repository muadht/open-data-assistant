export interface SseMessage {
  event: string
  data: string
}

/** Parses a Server-Sent Events byte stream. Network chunks don't line up with events, so
 * input is buffered until a blank line ends each event. Only the `event` and `data` fields
 * are used by docs/chat-api.md; comments and other fields are ignored. */
export async function* parseSse(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<SseMessage> {
  const reader = stream.getReader()
  // stream: true keeps a multi-byte character that's split across chunks intact.
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      // A chunk can end between the \r and \n of a \r\n line ending; hold a trailing \r
      // back so it isn't read as a line break on its own.
      const heldCr = buffer.endsWith('\r')
      buffer = buffer.slice(0, heldCr ? -1 : undefined).replace(/\r\n?/g, '\n')
      let end: number
      while ((end = buffer.indexOf('\n\n')) !== -1) {
        const message = parseBlock(buffer.slice(0, end))
        buffer = buffer.slice(end + 2)
        if (message) yield message
      }
      if (heldCr) buffer += '\r'
    }
  } finally {
    reader.releaseLock()
  }
}

function parseBlock(block: string): SseMessage | null {
  let event = 'message'
  const data: string[] = []
  for (const line of block.split('\n')) {
    if (line.startsWith(':')) continue
    const colon = line.indexOf(':')
    const field = colon === -1 ? line : line.slice(0, colon)
    const value = colon === -1 ? '' : line.slice(colon + 1).replace(/^ /, '')
    if (field === 'event') event = value
    else if (field === 'data') data.push(value)
  }
  return data.length ? { event, data: data.join('\n') } : null
}
