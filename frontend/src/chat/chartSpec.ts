import { pointFlags } from './answerDetails'
import type { DataPoint, DataResult } from './events'

// When an answer gets a chart, and which kind, decided from the shape of its data alone -
// the model never chooses or draws charts (docs/architecture-overview.md, "answer -> chart").
//
//   several periods, <= MAX_LINES series   -> line chart, one line per series
//   one period each, or too many series    -> bar chart of each series' latest value
//   one series, one period                 -> no chart (the answer states the number)
//
// Series in different units never share a chart (no dual axes): one chart per unit.

/** The validated categorical palette has 8 slots; a 9th series is never a new colour. */
export const MAX_LINES = 8

export interface ChartSeries {
  key: string
  name: string
  color: string
  decimals: number
}

export interface ChartPoint {
  value: number | null
  flags: string[]
}

export interface LineChartSpec {
  kind: 'line'
  title: string
  unit: string
  series: ChartSeries[]
  /** One row per reference period, oldest first; `values[key]` is null for a gap. */
  rows: { refPer: string; values: Record<string, ChartPoint | undefined> }[]
}

export interface BarChartSpec {
  kind: 'bar'
  title: string
  unit: string
  bars: (ChartSeries & ChartPoint & { refPer: string })[]
}

export type ChartSpec = LineChartSpec | BarChartSpec

export function chartSpecs(results: DataResult[]): ChartSpec[] {
  const byUnit = new Map<string, DataResult[]>()
  for (const result of results) {
    const unit = result.series[0]?.uom
    if (unit === undefined) continue
    byUnit.set(unit, [...(byUnit.get(unit) ?? []), result])
  }
  return [...byUnit].flatMap(([unit, group]) => {
    const spec = specFor(unit, group)
    return spec ? [spec] : []
  })
}

function specFor(unit: string, results: DataResult[]): ChartSpec | null {
  const names = seriesNames(results)
  const title = titleFor(results)
  const longest = Math.max(...results.map((r) => r.series.length))

  if (longest >= 2 && results.length <= MAX_LINES) {
    const series = results.map((r, i) => ({
      key: r.coordinate,
      name: names[i],
      color: `var(--series-${i + 1})`,
      decimals: r.series[0].decimals,
    }))
    const periods = [
      ...new Set(results.flatMap((r) => r.series.map((p) => p.ref_per))),
    ].sort()
    const rows = periods.map((refPer) => ({
      refPer,
      values: Object.fromEntries(
        results.map((r) => {
          const point = r.series.find((p) => p.ref_per === refPer)
          return [r.coordinate, point && toChartPoint(point)]
        }),
      ),
    }))
    return { kind: 'line', title, unit, series, rows }
  }

  if (results.length >= 2) {
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
    return { kind: 'bar', title, unit, bars }
  }

  return null
}

function toChartPoint(point: DataPoint): ChartPoint {
  return { value: point.value, flags: pointFlags(point, false) }
}

/** Names that tell the series apart: the members that differ between them (e.g. just
 * "Alberta" / "Ontario"), or all members for a single series. */
function seriesNames(results: DataResult[]): string[] {
  const dimensions = Object.keys(results[0].members)
  const varying =
    results.length === 1
      ? dimensions
      : dimensions.filter(
          (d) => new Set(results.map((r) => r.members[d])).size > 1,
        )
  return results.map((r) =>
    varying.length
      ? varying.map((d) => r.members[d]).join(' · ')
      : r.series_title_en,
  )
}

/** What every series in the chart has in common, e.g. "All-items" for a CPI comparison. */
function titleFor(results: DataResult[]): string {
  if (results.length === 1) return results[0].title_en
  const shared = Object.keys(results[0].members).filter(
    (d) => new Set(results.map((r) => r.members[d])).size === 1,
  )
  return shared.length
    ? shared.map((d) => results[0].members[d]).join(' · ')
    : results[0].title_en
}

/** Period labels from the data itself: StatCan dates every period by its first day, so if
 * every period is 1 January the series is annual-or-coarser and the year alone is right;
 * otherwise show year and month. Never guesses a frequency the data doesn't show. */
export function periodLabeller(refPers: string[]): (refPer: string) => string {
  const yearly = refPers.every((p) => p.endsWith('-01-01'))
  return (refPer) => (yearly ? refPer.slice(0, 4) : refPer.slice(0, 7))
}

export function formatValue(
  value: number | null,
  unit: string,
  decimals: number,
  compact = false,
): string {
  if (value === null) return '–'
  const number = new Intl.NumberFormat('en-CA', {
    notation: compact ? 'compact' : 'standard',
    minimumFractionDigits: compact ? 0 : decimals,
    maximumFractionDigits: compact ? 1 : decimals,
  }).format(value)
  if (unit === 'Percent') return `${number}%`
  if (unit === 'Dollars') return `$${number}`
  return number
}
