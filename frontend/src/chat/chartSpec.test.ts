import { describe, expect, it } from 'vitest'
import answerComparison from '../mocks/answer-comparison.sse?raw'
import answerSingle from '../mocks/answer-single.sse?raw'
import {
  chartSpecs,
  formatValue,
  MAX_LINES,
  periodLabeller,
  type BarChartSpec,
  type LineChartSpec,
} from './chartSpec'
import type { DataPoint, DataResult } from './events'
import { parseSse } from './sse'

async function dataResults(text: string): Promise<DataResult[]> {
  for await (const m of parseSse(new Response(text).body!)) {
    if (m.event === 'answer') return JSON.parse(m.data).data_results
  }
  throw new Error('no answer')
}

function point(
  refPer: string,
  value: number | null,
  uom = 'Persons',
): DataPoint {
  return {
    ref_per: refPer,
    value,
    uom,
    scalar_factor_applied: true,
    status: value === null ? 'too unreliable to be published' : 'normal',
    symbol: null,
    security_level: 'public',
    decimals: 0,
    release_time: '2026-09-14T08:30',
  }
}

function result(geo: string, points: DataPoint[]): DataResult {
  return {
    product_id: 17100005,
    title_en: 'Population estimates',
    series_title_en: `${geo};Total`,
    members: { Geography: geo, Gender: 'Total' },
    footnotes: [],
    coordinate: `${geo}.1`,
    vector_id: 1,
    series: points,
    source_url: 'https://example.org',
    series_url: null,
    retrieved_at: '2026-10-09T00:00:00Z',
  }
}

describe('chartSpecs', () => {
  it('one series over time: a line chart titled by its table', async () => {
    const [spec] = chartSpecs(
      await dataResults(answerSingle),
    ) as LineChartSpec[]
    expect(spec.kind).toBe('line')
    expect(spec.unit).toBe('Percent')
    expect(spec.series).toHaveLength(1)
    expect(spec.rows).toHaveLength(12)
    expect(spec.series[0].name).toMatch(/^Ontario · Unemployment rate/)
  })

  it('a comparison over time: one line per series, named by what differs', async () => {
    const [spec] = chartSpecs(
      await dataResults(answerComparison),
    ) as LineChartSpec[]
    expect(spec.kind).toBe('line')
    expect(spec.title).toBe('All-items')
    expect(spec.series.map((s) => s.name)).toEqual(['Alberta', 'Ontario'])
    expect(spec.series.map((s) => s.color)).toEqual([
      'var(--series-1)',
      'var(--series-2)',
    ])
    const last = spec.rows.at(-1)!
    expect(last.refPer).toBe('2026-08-01')
    expect(last.values[spec.series[0].key]?.value).toBe(179.2)
  })

  it('a single period across series: bars of each series', () => {
    const specs = chartSpecs([
      result('Ontario', [point('2026-07-01', 16_262_121)]),
      result('Quebec', [point('2026-07-01', 9_085_000)]),
    ])
    const [spec] = specs as BarChartSpec[]
    expect(spec.kind).toBe('bar')
    expect(spec.title).toBe('Total')
    expect(spec.bars.map((b) => [b.name, b.value])).toEqual([
      ['Ontario', 16_262_121],
      ['Quebec', 9_085_000],
    ])
  })

  it('one series, one period: no chart', () => {
    expect(
      chartSpecs([result('Canada', [point('2021-01-01', 36_991_981)])]),
    ).toEqual([])
  })

  it('a suppressed value stays a gap with its flag, not a skipped point', () => {
    const [spec] = chartSpecs([
      result('Ontario', [
        point('2026-05-01', 10),
        point('2026-06-01', null),
        point('2026-07-01', 12),
      ]),
    ]) as LineChartSpec[]
    expect(spec.rows.map((r) => r.values['Ontario.1']?.value)).toEqual([
      10,
      null,
      12,
    ])
    expect(spec.rows[1].values['Ontario.1']?.flags).toEqual([
      'no value published',
      'too unreliable to be published',
    ])
  })

  it('never puts two units on one chart', () => {
    const percent = result('Ontario', [
      point('2026-07-01', 6.8, 'Percent'),
      point('2026-08-01', 6.9, 'Percent'),
    ])
    const dollars = {
      ...result('Ontario wages', [
        point('2026-07-01', 1200, 'Dollars'),
        point('2026-08-01', 1210, 'Dollars'),
      ]),
      coordinate: 'wages',
    }
    expect(chartSpecs([percent, dollars]).map((s) => s.unit)).toEqual([
      'Percent',
      'Dollars',
    ])
  })

  it(`more than ${MAX_LINES} series over time fall back to bars of the latest value`, () => {
    const many = Array.from({ length: MAX_LINES + 1 }, (_, i) =>
      result(`Region ${i}`, [
        point('2025-01-01', i),
        point('2026-01-01', i + 1),
      ]),
    )
    const [spec] = chartSpecs(many) as BarChartSpec[]
    expect(spec.kind).toBe('bar')
    expect(spec.bars[0]).toMatchObject({ refPer: '2026-01-01', value: 1 })
  })
})

describe('labels and values', () => {
  it('labels periods by year only when every period is 1 January', () => {
    expect(periodLabeller(['2020-01-01', '2021-01-01'])('2021-01-01')).toBe(
      '2021',
    )
    expect(periodLabeller(['2026-07-01', '2026-08-01'])('2026-08-01')).toBe(
      '2026-08',
    )
  })

  it('formats with the published decimals and the unit', () => {
    expect(formatValue(6.9, 'Percent', 1)).toBe('6.9%')
    expect(formatValue(170, '2002=100', 1)).toBe('170.0')
    expect(formatValue(3_437_720_000_000, 'Dollars', 0, true)).toBe('$3.4T')
    expect(formatValue(null, 'Percent', 1)).toBe('–')
  })
})
