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

    // One line chart for the comparison; its table view lists the same values.
    const chart = await screen.findByRole('figure')
    expect(within(chart).getByText('All-items')).toBeTruthy()
    expect(
      within(chart).getByRole('img', { name: 'Line chart: All-items' }),
    ).toBeTruthy()
    fireEvent.click(
      within(chart).getByRole('button', { name: /Show as table/ }),
    )
    const table = within(chart).getByRole('table')
    expect(within(table).getByText('Alberta')).toBeTruthy()
    expect(within(table).getAllByRole('row')).toHaveLength(14) // header + 13 months
    expect(within(table).getByText('179.2')).toBeTruthy()

    // Each number in the text carries a numbered citation linking to its source (#63).
    const albertaMarker = screen.getByRole('link', {
      name: 'Source 1: Alberta, 2026-08',
    })
    expect(albertaMarker.textContent).toBe('1')
    expect(albertaMarker.getAttribute('href')).toContain(
      'vectorNumbers=v41692327',
    )
    expect(albertaMarker.getAttribute('target')).toBe('_blank')
    expect(
      screen.getByRole('link', { name: 'Source 2: Ontario, 2026-08' }),
    ).toBeTruthy()

    // Sources are always shown: a numbered list named by what differs, with the shared
    // members and StatCan's notes once per table.
    const sources = screen.getByRole('region', { name: 'Sources' })
    expect(within(sources).getByText('All series: All-items')).toBeTruthy()
    expect(
      within(within(sources).getAllByRole('list')[0])
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      '1.Alberta · v41692327 · 2026-08',
      '2.Ontario · v41691919 · 2026-08',
    ])
    expect(within(sources).getByText(/StatCan notes \(\d+\)/)).toBeTruthy()

    // Steps collapse to a summary once done; the recovered failed step is progress, not
    // an error.
    expect(screen.getByText('Worked through 4 steps')).toBeTruthy()
    expect(screen.getByText(/\(retrying\)/)).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByRole('button', { name: 'Copy answer' })).toBeTruthy()

    // Related tables are a row of chips: the first 3, then "+1 more" for the rest.
    const related = screen.getByRole('region', { name: 'Related tables' })
    expect(within(related).getAllByRole('link')).toHaveLength(3)
    const first = within(related).getByRole('link', {
      name: /^Consumer Price Index, monthly, seasonally adjusted, 18-10-0006-01 · Monthly · 1992–2026$/,
    })
    expect(first.getAttribute('target')).toBe('_blank')
    fireEvent.click(within(related).getByRole('button', { name: '+1 more' }))
    expect(within(related).getAllByRole('link')).toHaveLength(4)
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
