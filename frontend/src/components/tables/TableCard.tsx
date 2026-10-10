import type { TableCandidate } from '@/chat/events'
import { coverageYears, formatReleaseDate, tableNumber } from '@/chat/tables'

/** The most specific subject a table is filed under, e.g. "Consumer price indexes" - its
 * full path repeats the top level for every table, so the last level says it all. */
function shortSubject(subjects: string[]): string | null {
  const deepest = subjects.reduce<string | null>(
    (best, s) =>
      !best || s.split('/').length > best.split('/').length ? s : best,
    null,
  )
  return deepest?.split('/').at(-1) ?? null
}

/** One table in the browse results: what it is on the left, when and how often on the
 * right. The whole row opens the table's details. BrowsePage puts rows in one divided
 * list rather than each in its own box. */
export function TableCard({
  table,
  onOpen,
}: {
  table: TableCandidate
  onOpen: (productId: number) => void
}) {
  const subject = shortSubject(table.subjects)
  return (
    <button
      type="button"
      onClick={() => onOpen(table.product_id)}
      title={`${table.title_en} (${tableNumber(table.product_id)})`}
      className="grid w-full gap-x-6 gap-y-1 px-4 py-3 text-left hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none sm:grid-cols-[minmax(0,1fr)_auto]"
    >
      <span className="min-w-0 space-y-0.5">
        <span className="block leading-snug font-medium">
          {table.title_en}
          {!table.is_active && (
            <span className="ml-2 inline-block rounded bg-muted px-1.5 py-0.5 align-middle text-xs font-normal text-muted-foreground">
              Archived
            </span>
          )}
        </span>
        {subject && (
          <span className="block text-xs text-muted-foreground">{subject}</span>
        )}
      </span>
      <span className="space-y-0.5 text-xs text-muted-foreground sm:text-right">
        {table.last_released && (
          <span className="block whitespace-nowrap">
            Updated {formatReleaseDate(table.last_released)}
          </span>
        )}
        <span className="block whitespace-nowrap">
          {table.frequency} · {coverageYears(table.date_range)}
        </span>
      </span>
    </button>
  )
}
