// @vitest-environment jsdom
// The left sidebar (#76): New chat and Recents, switching between this page session's chats.
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import App from './App'
import answerSingle from './mocks/answer-single.sse?raw'
import type { ChatRequest, ChatTransport } from './chat/transport'

let wide = true
let roomForBoth = true

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Element.prototype.scrollTo ??= () => {}
})

beforeEach(() => {
  wide = true
  roomForBoth = true
  window.matchMedia = (query: string) =>
    ({
      matches: query.includes('1280px') ? roomForBoth : wide,
      addEventListener() {},
      removeEventListener() {},
    }) as unknown as MediaQueryList
  window.location.hash = ''
})

afterEach(cleanup)

/** Answers every question, each new conversation in its own server session (s1, s2, ...). */
function sessionTransport(sent: ChatRequest[]): ChatTransport {
  let sessions = 0
  return async (request) => {
    sent.push(request)
    const id = request.session_id ?? `s${++sessions}`
    return new Response(answerSingle.replaceAll('mock-session', id))
  }
}

async function ask(question: string) {
  fireEvent.change(screen.getByLabelText('Your question'), {
    target: { value: question },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Send' }))
  await screen.findAllByRole('region', { name: 'Sources' })
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Send' })).toBeTruthy(),
  )
}

describe('Sidebar', () => {
  it('keeps earlier chats in Recents and switches back to them', async () => {
    const sent: ChatRequest[] = []
    render(<App transport={sessionTransport(sent)} />)
    const sidebar = screen.getByRole('navigation', { name: 'Sidebar' })
    expect(
      within(sidebar).getByText('Your chats will appear here.'),
    ).toBeTruthy()

    await ask('Unemployment in Ontario?')
    // The current chat is listed, titled by its first question.
    expect(
      within(sidebar)
        .getByRole('button', { name: 'Unemployment in Ontario?' })
        .getAttribute('aria-current'),
    ).toBe('page')

    fireEvent.click(within(sidebar).getByRole('button', { name: 'New chat' }))
    expect(screen.getByText('What would you like to know?')).toBeTruthy()
    await ask('Unemployment in Alberta?')
    expect(sent.map((r) => r.session_id ?? null)).toEqual([null, null])

    // Back to the first chat: its messages, and follow-ups continue its session.
    fireEvent.click(
      within(sidebar).getByRole('button', { name: 'Unemployment in Ontario?' }),
    )
    const conversation = screen.getByRole('main')
    expect(
      within(conversation).getByText('Unemployment in Ontario?'),
    ).toBeTruthy()
    expect(
      within(conversation).queryByText('Unemployment in Alberta?'),
    ).toBeNull()
    await ask('And Quebec?')
    expect(sent.at(-1)?.session_id).toBe('s1')

    // And the second one is still there, with its own session.
    fireEvent.click(
      within(sidebar).getByRole('button', { name: 'Unemployment in Alberta?' }),
    )
    await ask('And Manitoba?')
    expect(sent.at(-1)?.session_id).toBe('s2')
    expect(within(sidebar).getAllByRole('listitem')).toHaveLength(2)
  })

  it('collapses and opens again', () => {
    render(<App transport={sessionTransport([])} />)
    fireEvent.click(screen.getByRole('button', { name: 'Close sidebar' }))
    expect(screen.queryByRole('navigation', { name: 'Sidebar' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Open sidebar' }))
    expect(screen.getByRole('navigation', { name: 'Sidebar' })).toBeTruthy()
  })

  it('takes turns with the table panel when there is no room for both', () => {
    roomForBoth = false
    render(<App transport={sessionTransport([])} />)
    fireEvent.click(screen.getByRole('button', { name: 'Browse tables' }))
    // The panel opens and the sidebar makes way...
    expect(
      screen.getByRole('complementary', { name: 'Browse tables' }),
    ).toBeTruthy()
    expect(screen.queryByRole('navigation', { name: 'Sidebar' })).toBeNull()

    // ...and opening the sidebar again closes the panel.
    fireEvent.click(screen.getByRole('button', { name: 'Open sidebar' }))
    expect(screen.getByRole('navigation', { name: 'Sidebar' })).toBeTruthy()
    expect(screen.queryByRole('complementary')).toBeNull()
  })

  it('opens over the chat on a narrow screen', () => {
    wide = false
    roomForBoth = false
    render(<App transport={sessionTransport([])} />)
    expect(screen.queryByRole('navigation', { name: 'Sidebar' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Open sidebar' }))
    const dialog = screen.getByRole('dialog')
    expect(
      within(dialog).getByRole('navigation', { name: 'Sidebar' }),
    ).toBeTruthy()
  })
})
