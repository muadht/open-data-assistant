import type { TableCandidate } from './events'

/** StatCan's own table number format: 18100004 -> "18-10-0004-01". */
export function tableNumber(productId: number): string {
  const id = String(productId).padStart(8, '0')
  return `${id.slice(0, 2)}-${id.slice(2, 4)}-${id.slice(4, 8)}-01`
}

export function tableUrl(productId: number): string {
  return `https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=${productId}01`
}

/** "1992–2026", or just "2021" when a table covers a single year. */
export function coverageYears({
  start,
  end,
}: TableCandidate['date_range']): string {
  const [from, to] = [start.slice(0, 4), end.slice(0, 4)]
  return from === to ? from : `${from}–${to}`
}

const RELEASE_DATE = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
})

/** A readable release date: "2026-09-14" -> "Sep 14, 2026". */
export function formatReleaseDate(isoDate: string): string {
  return RELEASE_DATE.format(new Date(`${isoDate}T00:00:00Z`))
}
