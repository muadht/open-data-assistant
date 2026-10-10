// @vitest-environment jsdom
// The browse page, table drawer and "Ask about this table" (#56), with the tables API
// stubbed at fetch and the chat answered by a capturing transport.
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

beforeEach(() => {
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
    expect(
      within(results).getByText(
        /18-10-0006-01 · Monthly · 1992–2026 · updated 2026-09-14/,
      ),
    ).toBeTruthy()

    const filters = screen.getByRole('complementary', { name: 'Filters' })
    fireEvent.click(
      within(filters).getByRole('button', { name: /Prices and price indexes/ }),
    )
    await waitFor(() =>
      expect(requested().at(-1)).toBe(
        '/tables/search?subject=Prices+and+price+indexes&page=1',
      ),
    )
    expect(window.location.hash).toBe(
      '#/browse?subject=Prices+and+price+indexes',
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
