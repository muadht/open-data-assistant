// @vitest-environment jsdom
// Renders the real App against the mock streams (src/mocks/) and checks what the user sees.
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import App from './App'
import { createMockTransport } from './chat/transport'

beforeAll(() => {
  // jsdom lacks these; the chat container's stick-to-bottom scrolling uses them.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Element.prototype.scrollTo ??= () => {}
})

afterEach(cleanup)

function renderApp() {
  render(<App transport={createMockTransport(0)} />)
}

function ask(question: string) {
  fireEvent.change(screen.getByLabelText('Your question'), {
    target: { value: question },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Send' }))
}

describe('App with mock streams', () => {
  it('shows a comparison answer with a source, period and flags for each series', async () => {
    renderApp()
    fireEvent.click(
      screen.getByRole('button', {
        name: "How does Ontario's CPI compare with Alberta's?",
      }),
    )

    const sources = await screen.findByRole('region', { name: 'Sources' })
    expect(within(sources).getByText(/Alberta · All-items/)).toBeTruthy()
    expect(within(sources).getByText(/Ontario · All-items/)).toBeTruthy()
    expect(within(sources).getAllByText('2026-08-01')).toHaveLength(2)
    expect(within(sources).getAllByText('None')).toHaveLength(2)
    expect(within(sources).getAllByText(/StatCan notes/)).toHaveLength(2)

    // The recovered failed step is progress, not an error.
    expect(screen.getByText(/\(retrying\)/)).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()

    // Markdown links in the answer open in a new tab.
    const link = screen.getAllByRole('link', { name: /v41692327/ })[0]
    expect(link.getAttribute('target')).toBe('_blank')
  })

  it('turns clarification options into buttons that send the choice', async () => {
    renderApp()
    ask("What's inflation?")
    const option = await screen.findByRole('button', {
      name: 'CPI, seasonally adjusted',
    })
    fireEvent.click(option)
    // The option is sent as the user's next message.
    expect(
      await screen.findByText('CPI, seasonally adjusted', { selector: 'div' }),
    ).toBeTruthy()
  })

  it('shows "can\'t answer" with the alternative', async () => {
    renderApp()
    ask('Ontario census population by quarter')
    expect(
      await screen.findByText(/Census is only taken every five years/),
    ).toBeTruthy()
    expect(screen.getByText(/2016 and 2021 censuses/)).toBeTruthy()
  })

  it('shows an error with a working "Try again"', async () => {
    renderApp()
    ask('show me an error')
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/data service is updating/)
    fireEvent.click(within(alert).getByRole('button', { name: /Try again/ }))
    // The question is sent again and gets its own reply.
    await waitFor(() => expect(screen.getAllByRole('alert')).toHaveLength(2))
    expect(screen.getAllByText('show me an error')).toHaveLength(2)
  })
})
