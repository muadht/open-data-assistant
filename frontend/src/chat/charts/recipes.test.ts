import { describe, expect, it } from 'vitest'
import answerProvinces from '../../mocks/answer-provinces.sse?raw'
import { chartGroups, type BarChartSpec, type MapChartSpec } from '../chartSpec'
import type { DataPoint, DataResult } from '../events'
import { parseSse } from '../sse'
import { colorScale } from './colorScale'
import { PROVINCES, provinceCode } from './provinces'

async function dataResults(text: string): Promise<DataResult[]> {
  for await (const m of parseSse(new Response(text).body!)) {
    if (m.event === 'answer') return JSON.parse(m.data).data_results
  }
  throw new Error('no answer')
}

function point(refPer: string, value: number | null): DataPoint {
  return {
    ref_per: refPer,
    value,
    uom: 'Percent',
    scalar_factor_applied: true,
    status: value === null ? 'too unreliable to be published' : 'normal',
    symbol: null,
    security_level: 'public',
    decimals: 1,
    release_time: '2026-10-09T08:30',
  }
}

function result(
  geo: string,
  points: DataPoint[],
  members: Record<string, string> = {},
): DataResult {
  return {
    product_id: 14100287,
    title_en: 'Labour force characteristics',
    series_title_en: `${geo};Unemployment rate`,
    members: {
      Geography: geo,
      Characteristic: 'Unemployment rate',
      ...members,
    },
    footnotes: [],
    coordinate: `${geo}.${JSON.stringify(members)}`,
    vector_id: 1,
    series: points,
    source_url: 'https://example.org',
    series_url: null,
    retrieved_at: '2026-10-10T00:00:00Z',
  }
}

const provinceNames = PROVINCES.map((p) => p.name)

describe('the province/territory map', () => {
  it('maps one value per province, with Canada as the reference and gaps as no data', async () => {
    const [group] = chartGroups(await dataResults(answerProvinces))
    expect(group.views.map((v) => v.kind)).toEqual(['map', 'bar'])

    const map = group.views[0] as MapChartSpec
    expect(map.refPer).toBe('2026-09-01')
    expect(map.national?.value).toBe(6.5)
    expect(map.regions).toHaveLength(13)
    expect(map.regions.find((r) => r.code === 'NL')?.value).toBe(9.1)
    // The survey doesn't cover the territories: on the map, but never as a value.
    expect(map.regions.find((r) => r.code === 'NU')).toMatchObject({
      value: null,
      flags: ['No data'],
    })
  })

  it('offers bars ranked by value, with Canada in grey', async () => {
    const [group] = chartGroups(await dataResults(answerProvinces))
    const bars = (group.views[1] as BarChartSpec).bars
    expect(bars.map((b) => b.name).slice(0, 2)).toEqual([
      'Newfoundland and Labrador',
      'New Brunswick',
    ])
    expect(bars.at(-1)?.name).toBe('Manitoba')
    expect(bars.find((b) => b.name === 'Canada')?.color).toBe(
      'var(--muted-foreground)',
    )
  })

  it('maps the latest period of provinces over time, since 13 lines are too many', () => {
    const results = provinceNames.map((name, i) =>
      result(name, [point('2026-08-01', i), point('2026-09-01', i + 1)]),
    )
    const [group] = chartGroups(results)
    expect(group.views.map((v) => v.kind)).toEqual(['map', 'bar'])
    expect((group.views[0] as MapChartSpec).refPer).toBe('2026-09-01')
  })

  it('needs at least 10 provinces or territories', () => {
    const results = provinceNames
      .slice(0, 9)
      .map((name) => result(name, [point('2026-09-01', 5)]))
    expect(chartGroups(results)[0].views.map((v) => v.kind)).toEqual(['bar'])
  })

  it('has no map when another dimension varies too, or a place isn’t a province', () => {
    const bySex = provinceNames.flatMap((name) =>
      ['Men+', 'Women+'].map((sex) =>
        result(name, [point('2026-09-01', 5)], { Gender: sex }),
      ),
    )
    expect(chartGroups(bySex)[0].views.map((v) => v.kind)).toEqual(['bar'])

    const withCity = [
      ...provinceNames.map((name) => result(name, [point('2026-09-01', 5)])),
      result('Toronto, Ontario', [point('2026-09-01', 6)]),
    ]
    expect(chartGroups(withCity)[0].views.map((v) => v.kind)).toEqual(['bar'])
  })

  it('has no map when the provinces’ latest periods differ', () => {
    const results = provinceNames.map((name, i) =>
      result(name, [point(i === 0 ? '2026-08-01' : '2026-09-01', 5)]),
    )
    expect(chartGroups(results)[0].views.map((v) => v.kind)).toEqual(['bar'])
  })
})

describe('provinces and colours', () => {
  it('recognises provinces by the names tables use', () => {
    expect(provinceCode('Ontario')).toBe('ON')
    expect(provinceCode('Ontario [35]')).toBe('ON')
    expect(provinceCode('Québec')).toBe('QC')
    expect(provinceCode('Toronto, Ontario')).toBeNull()
  })

  it('splits the range into equal steps, lowest lightest', () => {
    const scale = colorScale([5, 6, 7, 8, 10])
    expect(scale.steps).toHaveLength(5)
    expect(scale.colorOf(5)).toBe('var(--seq-1)')
    expect(scale.colorOf(10)).toBe('var(--seq-5)')
    expect(scale.colorOf(7.4)).toBe('var(--seq-3)')
  })

  it('gives every province the middle step when all values are equal', () => {
    const scale = colorScale([3, 3, 3])
    expect(scale.steps).toHaveLength(1)
    expect(scale.colorOf(3)).toBe('var(--seq-3)')
  })
})
