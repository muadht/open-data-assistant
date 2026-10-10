import { describe, expect, it } from 'vitest'
import { citations, formatPeriods, linkCitations } from './citations'
import type { AnswerEvent, DataResult } from './events'

function result(geo: string, extra: Record<string, string> = {}): DataResult {
  return {
    product_id: 43100031,
    title_en: 'Immigrant tax filers',
    series_title_en: `${geo};Total, sex`,
    members: { Geography: geo, Sex: 'Total, sex', ...extra },
    footnotes: ['Shared table note.', `Note about ${geo}.`],
    coordinate: `${geo}.1`,
    vector_id: geo.length,
    series: [
      {
        ref_per: '2023-01-01',
        value: geo.length * 100,
        uom: 'Persons',
        scalar_factor_applied: true,
        status: geo === 'Nova Scotia' ? 'preliminary' : 'normal',
        symbol: null,
        security_level: 'public',
        decimals: 0,
        release_time: '2026-03-01T08:30',
      },
    ],
    source_url:
      'https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=4310003101',
    series_url: null,
    retrieved_at: '2026-10-10T00:00:00Z',
  }
}

const ontario = result('Ontario')
const quebec = result('Quebec')
const novaScotia = result('Nova Scotia')

function answer(text: string, values: DataResult[]): AnswerEvent {
  return {
    message_id: 'm1',
    text,
    values: values.map((r) => ({
      coordinate: r.coordinate,
      ref_per: '2023-01-01',
      value: r.series[0].value,
    })),
    data_results: [...new Map(values.map((r) => [r.coordinate, r])).values()],
  }
}

describe('citations', () => {
  it('numbers sources by first citation and names them by what differs', () => {
    const c = citations(answer('', [ontario, quebec, novaScotia]))
    expect(c.sources.map((s) => [s.number, s.shortName])).toEqual([
      [1, 'Ontario'],
      [2, 'Quebec'],
      [3, 'Nova Scotia'],
    ])
    const [group] = c.groups
    expect(group.table.productId).toBe(43100031)
    expect(group.shared).toEqual(['Total, sex'])
    // Notes are stated once per table, not once per series.
    expect(group.footnotes).toEqual([
      'Shared table note.',
      'Note about Ontario.',
      'Note about Quebec.',
      'Note about Nova Scotia.',
    ])
    expect(c.flaggedCount).toBe(1)
  })

  it('gives two values from the same series one source number', () => {
    const c = citations(answer('', [ontario, quebec, ontario]))
    expect(c.sourceOfValue).toEqual([1, 2, 1])
    expect(c.sources).toHaveLength(2)
  })
})

describe('linkCitations', () => {
  it('rewrites value markers as source links', () => {
    expect(linkCitations('Ontario 700 [1], Quebec 600 [2].', [1, 2])).toBe(
      'Ontario 700 [1](#cite-1), Quebec 600 [2](#cite-2).',
    )
  })

  it('collapses adjacent markers for the same source and drops unknown ones', () => {
    expect(linkCitations('Rose from 6.8 to 7.0 [1][2] [9].', [1, 1])).toBe(
      'Rose from 6.8 to 7.0 [1](#cite-1) .',
    )
  })
})

describe('formatPeriods', () => {
  it('lists one or two periods and collapses more into a range', () => {
    expect(formatPeriods(['2026-08-01'])).toBe('2026-08')
    expect(formatPeriods(['2026-08-01', '2025-08-01'])).toBe('2025-08, 2026-08')
    const years = Array.from({ length: 10 }, (_, i) => `${2016 + i}-01-01`)
    expect(formatPeriods(years)).toBe('2016–2025 (10 periods)')
  })
})
