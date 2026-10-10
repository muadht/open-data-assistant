import { ChevronRight } from 'lucide-react'
import type { TableCandidate } from '@/chat/events'
import { coverageYears, tableNumber, tableUrl } from '@/chat/tables'

/** Other tables that may interest the user. Secondary information, so it's one collapsed
 * line by default (like the steps summary), expanding to one short line per table. Links to
 * StatCan's page until the table details panel exists (#56). */
export function RelatedTables({ tables }: { tables: TableCandidate[] }) {
  if (!tables.length) return null
  return (
    <details className="group text-sm text-muted-foreground">
      <summary className="flex w-fit cursor-pointer list-none items-center gap-1 hover:text-foreground">
        <ChevronRight
          className="size-4 transition-transform group-open:rotate-90"
          aria-hidden
        />
        {tables.length} related {tables.length === 1 ? 'table' : 'tables'}
      </summary>
      <ul aria-label="Related tables" className="mt-1 space-y-0.5 pl-5">
        {tables.map((table) => (
          <li key={table.product_id} className="truncate">
            <a
              href={tableUrl(table.product_id)}
              target="_blank"
              rel="noopener noreferrer"
              title={table.title_en}
              className="text-foreground hover:underline"
            >
              {table.title_en}
            </a>{' '}
            <span className="text-xs">
              {tableNumber(table.product_id)} · {table.frequency} ·{' '}
              {coverageYears(table.date_range)}
              {!table.is_active && ' · Archived'}
            </span>
          </li>
        ))}
      </ul>
    </details>
  )
}
