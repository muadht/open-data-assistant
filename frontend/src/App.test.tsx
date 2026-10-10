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
import { EXAMPLE_QUESTIONS } from './chat/examples'
import { createMockTransport } from './chat/transport'
import answerSingle from './mocks/answer-single.sse?raw'

beforeAll(() => {
  // The table panel (#70) checks the screen width.
  window.matchMedia ??= () =>
    ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    }) as unknown as MediaQueryList
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

/** Picks a view from a chart's ⋯ menu. Radix menus open on pointerdown, not click. */
async function chooseView(
  name: string | RegExp,
  scope: HTMLElement = document.body,
) {
  fireEvent.pointerDown(
    within(scope).getByRole('button', { name: 'Chart view' }),
    { button: 0, ctrlKey: false },
  )
  fireEvent.click(await screen.findByRole('menuitemradio', { name }))
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
    ask("How does Ontario's CPI compare with Alberta's?")

    // One line chart for the comparison; its table view lists the same values.
    const chart = await screen.findByRole('figure')
    expect(within(chart).getByText('All-items')).toBeTruthy()
    expect(
      within(chart).getByRole('img', { name: 'Line chart: All-items' }),
    ).toBeTruthy()
    await chooseView('Table', chart)
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

    // Related tables are a row of chips (buttons opening the table's details, #56): the
    // first 3, then "+1 more" for the rest.
    const related = screen.getByRole('region', { name: 'Related tables' })
    const chips = () => within(related).queryAllByRole('button', { name: /·/ })
    expect(chips()).toHaveLength(3)
    expect(
      within(related).getByRole('button', {
        name: /^Consumer Price Index, monthly, seasonally adjusted, 18-10-0006-01 · Monthly · 1992–2026$/,
      }),
    ).toBeTruthy()
    fireEvent.click(within(related).getByRole('button', { name: '+1 more' }))
    expect(chips()).toHaveLength(4)
  })

  it('maps an answer across the provinces, with a menu to switch to ranked bars or a table (#82, #86)', async () => {
    renderApp()
    ask('Unemployment rate by province')
    const map = await screen.findByRole('img', { name: /^Map: / })
    // Each province carries its value; one the data doesn't cover says so.
    expect(
      within(map).getByLabelText('Newfoundland and Labrador: 9.1%'),
    ).toBeTruthy()
    expect(within(map).getByLabelText('Nunavut: No data')).toBeTruthy()
    expect(screen.getByText('Canada:')).toBeTruthy()

    // The ⋯ menu offers the views that fit, then the table, with the current one ticked.
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Chart view' }), {
      button: 0,
      ctrlKey: false,
    })
    const options = await screen.findAllByRole('menuitemradio')
    expect(options.map((o) => o.textContent)).toEqual([
      'Map',
      'Bar chart',
      'Table',
    ])
    expect(options[0].getAttribute('aria-checked')).toBe('true')

    // The table lists every province and territory, including those with no data.
    fireEvent.click(options[2])
    expect(screen.getByRole('row', { name: /Nunavut/ }).textContent).toContain(
      '–',
    )

    await chooseView('Bar chart')
    expect(screen.getByRole('img', { name: /^Bar chart: / })).toBeTruthy()
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

  it('shows three example questions from the pool, and clicking one asks it', async () => {
    renderApp()
    const shown = EXAMPLE_QUESTIONS.filter((q) =>
      screen.queryByRole('button', { name: q }),
    )
    expect(shown).toHaveLength(3)
    fireEvent.click(screen.getByRole('button', { name: shown[0] }))
    expect(await screen.findByText(shown[0], { selector: 'div' })).toBeTruthy()
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

describe('the answer while it is written (#91)', () => {
  it('shows a draft, marked as unchecked, then the validated answer', async () => {
    const encoder = new TextEncoder()
    let push: (text: string) => void = () => {}
    let close: () => void = () => {}
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        push = (text) => controller.enqueue(encoder.encode(text))
        close = () => controller.close()
      },
    })
    render(<App transport={async () => new Response(body)} />)
    ask("What's the unemployment rate in Ontario?")

    const [session, ...rest] = answerSingle.split(/(?<=\n\n)/)
    push(
      session +
        'event: answer_delta\ndata: {"message_id": "m1", "text": "Ontario\'s rate was **7.0%** [1] in"}\n\n',
    )

    // A draft: no citation markers, no sources yet, and it says it's being checked.
    const draft = await screen.findByText(/Ontario's rate was/)
    expect(draft.textContent).not.toContain('[1]')
    expect(screen.getByText('Checking the numbers…')).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Sources' })).toBeNull()

    // The validated answer replaces it.
    push(rest.join(''))
    close()
    expect(await screen.findByRole('region', { name: 'Sources' })).toBeTruthy()
    expect(screen.queryByText('Checking the numbers…')).toBeNull()
  })
})
