// @vitest-environment jsdom
// The browse page, table drawer and "Ask about this table" (#56), and a table's details beside
// the chat (#70), with the tables API stubbed at fetch and the chat answered by a capturing
// transport.
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import App from './App'
import answerSingle from './mocks/answer-single.sse?raw'
import clarification from './mocks/clarification.sse?raw'
import type { ChatRequest, ChatTransport } from './chat/transport'
import type { TableDetails, TableSearchResponse } from './tables/api'

const CPI_SA = {
  product_id: 18100006,
  title_en: 'Consumer Price Index, monthly, seasonally adjusted',
  subjects: [
    'Prices and price indexes',
    'Prices and price indexes/Consumer price indexes',
  ],
  frequency: 'Monthly',
  date_range: { start: '1992-01-01', end: '2026-08-01' },
  is_active: true,
  last_released: '2026-09-14',
  score: 0,
}

const SEARCH: TableSearchResponse = {
  total: 1,
  page: 1,
  page_size: 20,
  results: [CPI_SA],
  facets: {
    subjects: [
      { value: 'Prices and price indexes', count: 43 },
      { value: 'Labour', count: 9 },
    ],
    all_subjects: [
      { value: 'Prices and price indexes', count: 43 },
      { value: 'Prices and price indexes/Consumer price indexes', count: 12 },
      { value: 'Labour', count: 9 },
      { value: 'Business and consumer services and culture', count: 186 },
      {
        value: 'Business and consumer services and culture/Culture',
        count: 79,
      },
    ],
    frequencies: [{ value: 'Monthly', count: 43 }],
    active: 43,
    archived: 7,
  },
}

const DETAILS: TableDetails = {
  table: CPI_SA,
  subjects: CPI_SA.subjects,
  structure: {
    frequency: 'Monthly',
    is_census_table: false,
    dimensions: [
      {
        dimension_position_id: 1,
        name_en: 'Geography',
        member_count: 30,
        members: [
          {
            member_id: 2,
            name_en: 'Canada',
            parent_member_id: null,
            terminated: false,
          },
        ],
      },
    ],
  },
  source_url:
    'https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=1810000601',
}

const fetchMock = vi.fn(async (url: string) => {
  const body = url.startsWith('/tables/search') ? SEARCH : DETAILS
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
  })
})

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Element.prototype.scrollTo ??= () => {}
})

// Whether the screen is wide enough for the chat's table panel to sit beside it.
let wide = true

beforeEach(() => {
  wide = true
  window.matchMedia = () =>
    ({
      matches: wide,
      addEventListener() {},
      removeEventListener() {},
    }) as unknown as MediaQueryList
  window.location.hash = ''
  fetchMock.mockClear()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function requested(): string[] {
  return fetchMock.mock.calls.map(([url]) => url)
}

describe('Browse tables', () => {
  it('lists tables with filter counts, and filters through the URL', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Browse tables' }))

    const results = await screen.findByRole('region', { name: 'Results' })
    expect(within(results).getByText('1 table')).toBeTruthy()
    // One divided list: what the table is on the left, when and how often on the right.
    expect(within(results).getByText('Consumer price indexes')).toBeTruthy()
    expect(within(results).getByText('Updated Sep 14, 2026')).toBeTruthy()
    expect(within(results).getByText('Monthly · 1992–2026')).toBeTruthy()

    // Filters are one row of compact buttons, each opening a menu of options with counts.
    const filters = screen.getByRole('group', { name: 'Filters' })
    fireEvent.click(within(filters).getByRole('button', { name: 'Subject' }))
    fireEvent.click(
      await screen.findByRole('button', {
        name: /Prices and price indexes\s*43/,
      }),
    )
    await waitFor(() =>
      expect(requested().at(-1)).toBe(
        '/tables/search?subject=Prices+and+price+indexes&page=1',
      ),
    )
    expect(window.location.hash).toBe(
      '#/browse?subject=Prices+and+price+indexes',
    )

    // The button now shows the chosen subject, with a ✕ to clear it.
    expect(
      within(filters).getByRole('button', {
        name: 'Subject: Prices and price indexes',
      }),
    ).toBeTruthy()
    fireEvent.click(
      within(filters).getByRole('button', { name: 'Clear subject' }),
    )
    await waitFor(() => expect(window.location.hash).toBe('#/browse'))
  })

  it('searches subjects at any level of the hierarchy', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Browse tables' }))
    const filters = await screen.findByRole('group', { name: 'Filters' })
    await screen.findByRole('region', { name: 'Results' })
    fireEvent.click(within(filters).getByRole('button', { name: 'Subject' }))

    fireEvent.change(await screen.findByLabelText('Search subjects'), {
      target: { value: 'consumer' },
    })
    // Matched on each subject's own name: "Culture" isn't a match just because its parent's
    // name contains "consumer".
    expect(screen.queryByRole('button', { name: /› Culture/ })).toBeNull()
    expect(
      screen.getByRole('button', {
        name: /^Business and consumer services and culture\s*186/,
      }),
    ).toBeTruthy()
    // A second-level subject, found without drilling down from "Prices".
    fireEvent.click(
      screen.getByRole('button', {
        name: /Prices and price indexes › Consumer price indexes\s*12/,
      }),
    )
    await waitFor(() =>
      expect(window.location.hash).toBe(
        '#/browse?subject=Prices+and+price+indexes%2FConsumer+price+indexes',
      ),
    )
  })

  it('opens a table in the drawer and asks about it from the chat', async () => {
    const sent: ChatRequest[] = []
    const transport: ChatTransport = async (request) => {
      sent.push(request)
      return new Response(clarification)
    }
    render(<App transport={transport} />)
    fireEvent.click(screen.getByRole('button', { name: 'Browse tables' }))
    fireEvent.click(
      await screen.findByRole('button', { name: /Consumer Price Index/ }),
    )

    const drawer = await screen.findByRole('dialog')
    expect(await within(drawer).findByText('Canada')).toBeTruthy()
    expect(within(drawer).getByText('+29 more')).toBeTruthy()
    expect(requested()).toContain('/tables/18100006')

    fireEvent.click(
      within(drawer).getByRole('button', { name: /Ask about this table/ }),
    )

    // Back in the chat, with the table pinned above the input and sent with the message.
    expect(screen.getByText(/Asking about: Consumer Price Index/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Your question'), {
      target: { value: 'What was it in August?' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0].table_id).toBe(18100006)

    // Removing the pin stops sending it.
    fireEvent.click(
      screen.getByRole('button', { name: 'Stop asking about this table' }),
    )
    expect(screen.queryByText(/Asking about:/)).toBeNull()
  })
})

describe('Table structure in the chat', () => {
  async function answered() {
    render(<App transport={async () => new Response(answerSingle)} />)
    fireEvent.change(screen.getByLabelText('Your question'), {
      target: { value: 'Unemployment rate in Ontario?' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    return screen.findByRole('region', { name: 'Sources' })
  }

  it('opens beside the chat from a source, and closes with ✕ or Escape', async () => {
    const sources = await answered()
    fireEvent.click(
      within(sources).getAllByRole('button', { name: /^View structure of/ })[0],
    )

    const panel = await screen.findByRole('complementary')
    expect(await within(panel).findByText('Canada')).toBeTruthy()
    expect(within(panel).getByText('+29 more')).toBeTruthy()
    expect(requested()).toContain('/tables/14100287')
    // Beside the chat, not over it: no dialog, and the input still works.
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByLabelText('Your question')).toBeTruthy()

    fireEvent.click(
      within(panel).getByRole('button', { name: 'Close table details' }),
    )
    expect(screen.queryByRole('complementary')).toBeNull()

    fireEvent.click(
      within(sources).getAllByRole('button', { name: /^View structure of/ })[0],
    )
    await screen.findByRole('complementary')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('complementary')).toBeNull()
  })

  it('shows one table at a time, and asks about it from the panel', async () => {
    const sources = await answered()
    fireEvent.click(
      within(sources).getAllByRole('button', { name: /^View structure of/ })[0],
    )
    await screen.findByRole('complementary')

    // A related table replaces the open one rather than opening a second panel.
    const related = screen.getByRole('region', { name: 'Related tables' })
    fireEvent.click(within(related).getAllByRole('button', { name: /·/ })[0])
    await waitFor(() => expect(requested()).toContain('/tables/14100375'))
    expect(screen.getAllByRole('complementary')).toHaveLength(1)

    const panel = screen.getByRole('complementary')
    fireEvent.click(
      await within(panel).findByRole('button', {
        name: /Ask about this table/,
      }),
    )
    expect(screen.getByText(/Asking about: Consumer Price Index/)).toBeTruthy()
    // The panel stays open for reference while asking.
    expect(screen.getByRole('complementary')).toBeTruthy()

    // The pinned chip opens it again after closing.
    fireEvent.click(
      within(panel).getByRole('button', { name: 'Close table details' }),
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'View structure of this table' }),
    )
    expect(await screen.findByRole('complementary')).toBeTruthy()
  })

  it('opens over the chat on a narrow screen', async () => {
    wide = false
    const sources = await answered()
    fireEvent.click(
      within(sources).getAllByRole('button', { name: /^View structure of/ })[0],
    )
    const drawer = await screen.findByRole('dialog')
    expect(await within(drawer).findByText('Canada')).toBeTruthy()
    expect(screen.queryByRole('complementary')).toBeNull()
  })
})
