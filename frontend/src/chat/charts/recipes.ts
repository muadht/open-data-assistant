import { pointFlags } from '../answerDetails'
import {
  MAX_LINES,
  type BarChartSpec,
  type ChartPoint,
  type ChartSpec,
  type LineChartSpec,
  type MapChartSpec,
} from '../chartSpec'
import type { DataPoint, DataResult } from '../events'
import { distinguishingNames, sharedMembers } from '../seriesNames'
import {
  isCanada,
  PROVINCES,
  provinceCode,
  type ProvinceCode,
} from './provinces'

// The kinds of chart an answer can get. A recipe looks at the data's shape and returns its
// chart, or null when it doesn't fit; chartGroups (chartSpec.ts) offers every chart that
// fits, in this order, so the first is the default. A new kind of chart is a new recipe here
// and a view in AnswerChart.tsx.
//
//   line  several periods, <= MAX_LINES series              one line per series
//   map   one value per province/territory (10+ of them)   coloured provinces
//   bar   several series, when there's no line chart        each series' latest value
//
// One series at one period gets no chart: the answer states the number.

/** The data behind one chart: series sharing a unit, and what's known about them. */
export interface DataShape {
  unit: string
  results: DataResult[]
  /** What tells the series apart, e.g. "Ontario" (seriesNames.ts). */
  names: string[]
  /** What they have in common, e.g. "Unemployment rate · Estimate". */
  title: string
  /** Every reference period in the data, oldest first. */
  periods: string[]
  /** The dimensions whose members differ between the series, e.g. ["Geography"]. */
  varying: string[]
}

export type Recipe = (shape: DataShape) => ChartSpec | null

/** One shape per unit. */
export function shapesOf(results: DataResult[]): DataShape[] {
  const byUnit = new Map<string, DataResult[]>()
  for (const result of results) {
    const unit = result.series[0]?.uom
    if (unit === undefined) continue
    byUnit.set(unit, [...(byUnit.get(unit) ?? []), result])
  }
  return [...byUnit].map(([unit, group]) => ({
    unit,
    results: group,
    names: distinguishingNames(group),
    title: titleFor(group),
    periods: [
      ...new Set(group.flatMap((r) => r.series.map((p) => p.ref_per))),
    ].sort(),
    varying:
      group.length < 2
        ? []
        : Object.keys(group[0].members).filter(
            (d) => new Set(group.map((r) => r.members[d])).size > 1,
          ),
  }))
}

const line: Recipe = ({ unit, results, names, title, periods }) => {
  if (periods.length < 2 || results.length > MAX_LINES) return null
  const series = results.map((r, i) => ({
    key: r.coordinate,
    name: names[i],
    color: `var(--series-${i + 1})`,
    decimals: r.series[0].decimals,
  }))
  const rows = periods.map((refPer) => ({
    refPer,
    values: Object.fromEntries(
      results.map((r) => {
        const point = r.series.find((p) => p.ref_per === refPer)
        return [r.coordinate, point && toChartPoint(point)]
      }),
    ),
  }))
  return { kind: 'line', title, unit, series, rows } satisfies LineChartSpec
}

/** At least this many provinces/territories make a map worth drawing. */
const MIN_PROVINCES = 10

const map: Recipe = ({ unit, results, title, varying }) => {
  // Only Geography may vary: with another dimension too (e.g. sex), a province would have
  // several values and no single colour.
  if (varying.length !== 1 || !varying[0].startsWith('Geography')) return null
  const dimension = varying[0]
  const latest = results.map((r) => r.series.at(-1) as DataPoint)
  // One period for every province, or the colours wouldn't be comparable.
  if (new Set(latest.map((p) => p.ref_per)).size !== 1) return null

  const byCode = new Map<ProvinceCode, { point: DataPoint }>()
  let national: MapChartSpec['national'] = null
  for (const [i, result] of results.entries()) {
    const member = result.members[dimension]
    const code = provinceCode(member)
    if (code) byCode.set(code, { point: latest[i] })
    else if (isCanada(member))
      national = { ...toChartPoint(latest[i]), decimals: latest[i].decimals }
    // Anything else (a city, a region) has no place on this map; leaving it out would hide
    // data, so there's no map.
    else return null
  }
  if (byCode.size < MIN_PROVINCES) return null

  const regions = PROVINCES.map(({ code, name }) => {
    const found = byCode.get(code)
    return found
      ? {
          code,
          name,
          decimals: found.point.decimals,
          ...toChartPoint(found.point),
        }
      : { code, name, decimals: 0, value: null, flags: ['No data'] }
  })
  return {
    kind: 'map',
    title,
    unit,
    refPer: latest[0].ref_per,
    regions,
    national,
  } satisfies MapChartSpec
}

const bar: Recipe = (shape) => {
  const { unit, results, names, title, periods } = shape
  if (results.length < 2) return null
  // Bars are for when a line chart can't show the comparison.
  if (periods.length >= 2 && results.length <= MAX_LINES) return null
  // Bars compare entities, so they share one colour; identity is on the axis labels.
  const bars = results.map((r, i) => {
    const latest = r.series.at(-1) as DataPoint
    return {
      key: r.coordinate,
      name: names[i],
      color: 'var(--series-1)',
      decimals: latest.decimals,
      refPer: latest.ref_per,
      ...toChartPoint(latest),
    }
  })
  // Places have no natural order, so they're ranked, with Canada in grey as the reference
  // rather than one more place; other dimensions (e.g. age groups) keep the table's order.
  if (map(shape)) {
    bars.sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity))
    for (const bar of bars) {
      if (isCanada(bar.name)) bar.color = 'var(--muted-foreground)'
    }
  }
  return { kind: 'bar', title, unit, bars } satisfies BarChartSpec
}

export const RECIPES: Recipe[] = [line, map, bar]

function toChartPoint(point: DataPoint): ChartPoint {
  return { value: point.value, flags: pointFlags(point, false) }
}

/** What every series in the chart has in common, e.g. "All-items" for a CPI comparison. */
function titleFor(results: DataResult[]): string {
  const shared = sharedMembers(results)
  return shared.length ? shared.join(' · ') : results[0].title_en
}
