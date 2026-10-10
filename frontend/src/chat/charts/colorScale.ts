/** Number of colour steps on the map: few enough to tell apart, from one sequential ramp
 * (--seq-1, lightest, to --seq-5, darkest, in index.css; stepped separately for dark mode). */
export const MAP_STEPS = 5

export interface ColorScale {
  /** The CSS colour for a value; null (no data) is never on the ramp. */
  colorOf: (value: number) => string
  /** Each step's range, lowest first, for the legend. */
  steps: { from: number; to: number; color: string }[]
}

/** Equal-width steps from the lowest to the highest value. With one distinct value there's
 * nothing to compare, so everything gets the middle step. */
export function colorScale(values: number[]): ColorScale {
  const min = Math.min(...values)
  const max = Math.max(...values)
  if (!values.length || min === max) {
    const color = 'var(--seq-3)'
    return {
      colorOf: () => color,
      steps: values.length ? [{ from: min, to: max, color }] : [],
    }
  }
  const width = (max - min) / MAP_STEPS
  const stepOf = (value: number) =>
    Math.min(MAP_STEPS - 1, Math.floor((value - min) / width))
  return {
    colorOf: (value) => `var(--seq-${stepOf(value) + 1})`,
    steps: Array.from({ length: MAP_STEPS }, (_, i) => ({
      from: min + i * width,
      to: i === MAP_STEPS - 1 ? max : min + (i + 1) * width,
      color: `var(--seq-${i + 1})`,
    })),
  }
}
