import type { ProvinceCode } from './charts/provinces'
import { shapesOf, RECIPES } from './charts/recipes'
import type { DataResult } from './events'

// When an answer gets a chart, and which kind, decided from the shape of its data alone -
// the model never chooses or draws charts (docs/architecture-overview.md, "answer -> chart").
// Each kind of chart is a recipe in charts/recipes.ts that says when it applies; an answer
// gets every view that applies, best first, and the reader can switch between them.
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

/** One value per province or territory, at one period (#82). */
export interface MapChartSpec {
  kind: 'map'
  title: string
  unit: string
  refPer: string
  /** Every province and territory, in StatCan's order: those the data doesn't cover have
   * a null value and a "No data" flag, so they're never drawn as if they were zero. */
  regions: (ChartPoint & {
    code: ProvinceCode
    name: string
    decimals: number
  })[]
  /** Canada's own value, when the data has it, as a reference beside the map. */
  national: (ChartPoint & { decimals: number }) | null
}

export type ChartSpec = LineChartSpec | BarChartSpec | MapChartSpec

/** One chart per unit, with the views its data fits, best first. */
export interface ChartGroup {
  unit: string
  views: ChartSpec[]
}

export function chartGroups(results: DataResult[]): ChartGroup[] {
  return shapesOf(results).flatMap((shape) => {
    const views = RECIPES.flatMap((recipe) => recipe(shape) ?? [])
    return views.length ? [{ unit: shape.unit, views }] : []
  })
}

/** Each chart's default view. */
export function chartSpecs(results: DataResult[]): ChartSpec[] {
  return chartGroups(results).map((group) => group.views[0])
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
