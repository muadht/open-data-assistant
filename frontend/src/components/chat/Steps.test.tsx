// @vitest-environment jsdom
// The progress timeline: what each step found, and a running row between steps.
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { Step } from '@/chat/chatState'
import { Steps } from './Steps'

afterEach(cleanup)

const search: Step = {
  callId: 'c1',
  label: 'Searching StatCan tables',
  tool: 'search_tables',
  ok: true,
  detail: 'Top match: Labour force characteristics (14-10-0287-01)',
}
const fetch: Step = {
  callId: 'c2',
  label: 'Fetching data for 11 series',
  tool: 'get_data',
  ok: true,
  detail: 'Canada … British Columbia · 2026-09',
}

describe('Steps', () => {
  it('shows what each step found, under its label', () => {
    render(<Steps steps={[search]} active />)
    expect(
      screen.getByText(
        'Top match: Labour force characteristics (14-10-0287-01)',
      ),
    ).toBeTruthy()
  })

  it('shows a running row between steps, so the list never looks finished', () => {
    const { rerender } = render(<Steps steps={[search]} active />)
    expect(screen.getByText('Thinking…')).toBeTruthy()

    // After the data is fetched, the wait is the model writing the answer.
    rerender(<Steps steps={[search, fetch]} active />)
    expect(screen.getByText('Writing the answer…')).toBeTruthy()

    // While a step is running, that step is the running row.
    rerender(<Steps steps={[search, { ...fetch, ok: undefined }]} active />)
    expect(screen.queryByText(/Thinking…|Writing the answer…/)).toBeNull()
  })

  it('collapses to a summary once the reply is done', () => {
    render(<Steps steps={[search, fetch]} active={false} />)
    expect(screen.getByText('Worked through 2 steps')).toBeTruthy()
    expect(screen.queryByText('Writing the answer…')).toBeNull()
  })
})
