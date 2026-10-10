import type { AnswerEvent, DataPoint, DataResult } from './events'

export interface SeriesDetails {
  coordinate: string
  /** e.g. "Ontario · All-items", from the series' members. */
  name: string
  vectorId: number | null
  /** The series page if it has a vector, else the table page (e.g. Census tables). */
  link: string
  table: { title: string; productId: number; link: string }
  /** The reference periods the answer actually used from this series, in order. */
  periodsUsed: string[]
  /** When StatCan released the data points used, deduplicated. */
  releasedOn: string[]
  /** Quality flags on the data points used, in plain words; empty when there are none. */
  flags: string[]
  footnotes: string[]
}

/** Per-series citation, reference periods and quality flags for an answer (trust rules 1-3
 * in docs/mvp-scope.md). Only the data points the answer used count, so a flag on an older
 * period in the chart data isn't attributed to the answer. */
export function answerDetails(answer: AnswerEvent): SeriesDetails[] {
  return answer.data_results.map((result) => {
    const used = answer.values
      .filter((v) => v.coordinate === result.coordinate)
      .map((v) => result.series.find((p) => p.ref_per === v.ref_per))
      .filter((p): p is DataPoint => p !== undefined)
    return {
      coordinate: result.coordinate,
      name: seriesName(result),
      vectorId: result.vector_id,
      link: result.series_url ?? result.source_url,
      table: {
        title: result.title_en,
        productId: result.product_id,
        link: result.source_url,
      },
      periodsUsed: unique(used.map((p) => p.ref_per)),
      releasedOn: unique(used.map((p) => p.release_time.slice(0, 10))),
      flags: unique(used.flatMap((p) => pointFlags(p))),
      footnotes: result.footnotes,
    }
  })
}

function seriesName(result: DataResult): string {
  const members = Object.values(result.members)
  return members.length ? members.join(' · ') : result.series_title_en
}

function pointFlags(point: DataPoint): string[] {
  const flags: string[] = []
  if (point.value === null) flags.push(`${point.ref_per}: no value published`)
  if (point.status !== 'normal') flags.push(`${point.ref_per}: ${point.status}`)
  if (point.symbol) flags.push(`${point.ref_per}: ${point.symbol}`)
  if (point.security_level !== 'public') {
    flags.push(`${point.ref_per}: ${point.security_level}`)
  }
  return flags
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)]
}
