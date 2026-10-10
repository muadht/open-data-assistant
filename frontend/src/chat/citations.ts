import { answerDetails, type SeriesDetails } from './answerDetails'
import type { AnswerEvent } from './events'
import { distinguishingNames, sharedMembers } from './seriesNames'

// Numbered citations (#63). The model writes [n] after each number, where n is that
// number's position in `values`; the backend validator guarantees every marker is valid and
// every value is cited. Readers see one number per *source* (series), so two values from
// the same series share a number.

export interface CitedSource extends SeriesDetails {
  /** 1-based, in order of first citation. */
  number: number
  /** Just what tells this series apart from the others in its table, e.g. "Nova Scotia". */
  shortName: string
}

export interface SourceGroup {
  table: SeriesDetails['table']
  /** Members every series in this table has in common, stated once. */
  shared: string[]
  sources: CitedSource[]
  /** StatCan's notes for the table's series, deduplicated. */
  footnotes: string[]
}

export interface Citations {
  sources: CitedSource[]
  groups: SourceGroup[]
  /** Source number for each value, by the value's 0-based position. */
  sourceOfValue: number[]
  flaggedCount: number
}

export function citations(answer: AnswerEvent): Citations {
  // data_results arrive in order of first use by `values`, so this numbering follows the
  // order the sources are cited in.
  const details = answerDetails(answer)
  const numberOf = new Map(details.map((d, i) => [d.coordinate, i + 1]))

  const groups: SourceGroup[] = []
  for (const productId of new Set(details.map((d) => d.table.productId))) {
    const results = answer.data_results.filter(
      (r) => r.product_id === productId,
    )
    const names = distinguishingNames(results)
    const sources = results.map((r, i) => {
      const detail = details.find((d) => d.coordinate === r.coordinate)!
      return {
        ...detail,
        number: numberOf.get(r.coordinate)!,
        shortName: names[i],
      }
    })
    groups.push({
      table: sources[0].table,
      shared: sharedMembers(results),
      sources,
      footnotes: [...new Set(sources.flatMap((s) => s.footnotes))],
    })
  }
  const sources = groups
    .flatMap((g) => g.sources)
    .sort((a, b) => a.number - b.number)

  return {
    sources,
    groups,
    sourceOfValue: answer.values.map((v) => numberOf.get(v.coordinate) ?? 0),
    flaggedCount: sources.filter((s) => s.flags.length > 0).length,
  }
}

/** Rewrites value markers as source citations the markdown renderer can turn into
 * components: "[2]" -> "[1](#cite-1)" when value 2 comes from source 1. Adjacent markers
 * pointing at the same source collapse into one; a marker that matches nothing is dropped
 * rather than shown as a dead number. */
export function linkCitations(text: string, sourceOfValue: number[]): string {
  return text.replace(/(?:\[\d+\])+/g, (run) => {
    const numbers = [...run.matchAll(/\[(\d+)\]/g)]
      .map(([, n]) => sourceOfValue[Number(n) - 1])
      .filter((n): n is number => Boolean(n))
    return [...new Set(numbers)].map((n) => `[${n}](#cite-${n})`).join('')
  })
}
