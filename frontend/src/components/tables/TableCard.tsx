import { Fragment } from 'react'
import type { TableCandidate } from '@/chat/events'
import { coverageYears, formatReleaseDate, tableNumber } from '@/chat/tables'
import { cn } from '@/lib/utils'

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

/** One table in the browse results: its title, then what it covers on one small line. The
 * panel it's in is narrow (#74), so the details stack under the title rather than taking a
 * column of their own. The whole row opens the table's details. */
export function TableCard({
  table,
  onOpen,
}: {
  table: TableCandidate
  onOpen: (productId: number) => void
}) {
  const subject = shortSubject(table.subjects)
  const details = [
    subject,
    `${table.frequency} · ${coverageYears(table.date_range)}`,
    table.last_released && `Updated ${formatReleaseDate(table.last_released)}`,
  ].filter((d): d is string => Boolean(d))
  return (
    <button
      type="button"
      onClick={() => onOpen(table.product_id)}
      title={`${table.title_en} (${tableNumber(table.product_id)})`}
      className="block w-full space-y-1 px-4 py-3 text-left hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
    >
      <span className="block text-sm leading-snug font-medium">
        {table.title_en}
        {!table.is_active && (
          <span className="ml-2 inline-block rounded bg-muted px-1.5 py-0.5 align-middle text-xs font-normal text-muted-foreground">
            Archived
          </span>
        )}
      </span>
      <span className="flex flex-wrap gap-x-1.5 text-xs text-muted-foreground">
        {details.map((detail, i) => (
          <Fragment key={detail}>
            {i > 0 && <span aria-hidden>·</span>}
            <span className={cn(i > 0 && 'whitespace-nowrap')}>{detail}</span>
          </Fragment>
        ))}
      </span>
    </button>
  )
}
