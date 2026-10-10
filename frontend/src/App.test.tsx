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

    // A citation chip per series; clicking one shows its period, flags and notes.
    const sources = await screen.findByRole('region', { name: 'Sources' })
    const alberta = within(sources).getByRole('button', {
      name: /Alberta · All-items/,
    })
    expect(
      within(sources).getByRole('button', { name: /Ontario · All-items/ }),
    ).toBeTruthy()
    fireEvent.click(alberta)
    expect(alberta.getAttribute('aria-expanded')).toBe('true')
    expect(within(sources).getByText('2026-08-01')).toBeTruthy()
    expect(within(sources).getByText('None')).toBeTruthy()
    expect(within(sources).getByText(/StatCan notes \(\d+\)/)).toBeTruthy()

    // Steps collapse to a summary once done; the recovered failed step is progress, not
    // an error.
    expect(screen.getByText('Worked through 4 steps')).toBeTruthy()
    expect(screen.getByText(/\(retrying\)/)).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByRole('button', { name: 'Copy answer' })).toBeTruthy()

    // Related tables sit apart from the sources, as links to each table.
    const related = screen.getByRole('region', { name: 'Related tables' })
    const links = within(related).getAllByRole('link')
    expect(links).toHaveLength(4)
    expect(links[0].textContent).toMatch(
      /Consumer Price Index, monthly, seasonally adjusted/,
    )
    expect(links[0].textContent).toMatch(/18-10-0006-01 · Monthly · 1992–2026/)

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

  it('"New chat" clears the conversation', async () => {
    renderApp()
    ask("What's the unemployment rate in Ontario?")
    await screen.findByRole('region', { name: 'Sources' })
    fireEvent.click(screen.getByRole('button', { name: /New chat/ }))
    expect(screen.getByText('What would you like to know?')).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Sources' })).toBeNull()
  })
})
