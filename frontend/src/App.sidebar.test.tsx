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
      matches: query.includes('prefers-color-scheme')
        ? false
        : query.includes('1280px')
          ? roomForBoth
          : wide,
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

  it('collapses to an icon rail and expands again', () => {
    render(<App transport={sessionTransport([])} />)
    const sidebar = screen.getByRole('navigation', { name: 'Sidebar' })
    fireEvent.click(
      within(sidebar).getByRole('button', { name: 'Close sidebar' }),
    )

    // The rail keeps the actions and the avatar, as icons, but not Recents.
    const rail = screen.getByRole('navigation', { name: 'Sidebar' })
    expect(within(rail).queryByText('Recents')).toBeNull()
    expect(within(rail).getByRole('button', { name: 'New chat' })).toBeTruthy()
    expect(
      within(rail).getByRole('button', { name: 'Browse tables' }),
    ).toBeTruthy()
    expect(
      within(rail).getByRole('button', { name: 'Profile menu' }),
    ).toBeTruthy()

    fireEvent.click(within(rail).getByRole('button', { name: 'Open sidebar' }))
    expect(screen.getByText('Recents')).toBeTruthy()
  })

  it('takes turns with the table panel when there is no room for both', () => {
    roomForBoth = false
    render(<App transport={sessionTransport([])} />)
    fireEvent.click(screen.getByRole('button', { name: 'Browse tables' }))
    // The panel opens and the sidebar collapses to its rail...
    expect(
      screen.getByRole('complementary', { name: 'Browse tables' }),
    ).toBeTruthy()
    expect(screen.queryByText('Recents')).toBeNull()

    // ...and expanding the sidebar again closes the panel.
    fireEvent.click(screen.getByRole('button', { name: 'Open sidebar' }))
    expect(screen.getByText('Recents')).toBeTruthy()
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

describe('Profile menu and settings', () => {
  // Radix menus open on pointerdown, not click.
  function openProfileMenu() {
    const trigger = screen.getByRole('button', { name: 'Profile menu' })
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false })
  }

  beforeEach(() => {
    localStorage.clear()
    document.documentElement.classList.remove('dark')
  })

  it('switches the theme from Settings, and remembers it', async () => {
    render(<App transport={sessionTransport([])} />)
    expect(document.documentElement.classList.contains('dark')).toBe(false)

    openProfileMenu()
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Settings' }))
    const dialog = await screen.findByRole('dialog', { name: 'Settings' })
    const theme = within(dialog).getByRole('radiogroup', { name: 'Theme' })
    expect(
      within(theme)
        .getByRole('radio', { name: 'System' })
        .getAttribute('aria-checked'),
    ).toBe('true')

    fireEvent.click(within(theme).getByRole('radio', { name: 'Dark' }))
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(
      JSON.parse(localStorage.getItem('open-data-assistant:settings')!),
    ).toEqual({ theme: 'dark' })

    fireEvent.click(within(theme).getByRole('radio', { name: 'Light' }))
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('clears recent chats from Settings', async () => {
    render(<App transport={sessionTransport([])} />)
    await ask('Unemployment in Ontario?')
    const sidebar = screen.getByRole('navigation', { name: 'Sidebar' })
    expect(within(sidebar).getAllByRole('listitem')).toHaveLength(1)

    openProfileMenu()
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Settings' }))
    const dialog = await screen.findByRole('dialog', { name: 'Settings' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Data' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Clear' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Clear all' }))

    expect(within(sidebar).queryAllByRole('listitem')).toHaveLength(0)
    expect(screen.getByText('What would you like to know?')).toBeTruthy()
  })

  it('opens Help from the menu', async () => {
    render(<App transport={sessionTransport([])} />)
    openProfileMenu()
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Help' }))
    const dialog = await screen.findByRole('dialog', { name: 'Settings' })
    expect(
      within(dialog).getByRole('region', { name: 'Help & about' }),
    ).toBeTruthy()
  })
})
