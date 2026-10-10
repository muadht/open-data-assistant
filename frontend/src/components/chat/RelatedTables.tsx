import { ExternalLink } from 'lucide-react'
import type { TableCandidate } from '@/chat/events'
import { coverageYears, tableNumber, tableUrl } from '@/chat/tables'

/** Other tables that may interest the user. Suggestions only - they're not what the
 * answer used, so they sit apart from the sources. Opens StatCan's page until the table
 * details panel exists (#56). */
export function RelatedTables({ tables }: { tables: TableCandidate[] }) {
  if (!tables.length) return null
  return (
    <section aria-label="Related tables" className="space-y-2 text-sm">
      <h3 className="text-muted-foreground">Related tables</h3>
      <ul className="grid gap-2 sm:grid-cols-2">
        {tables.map((table) => (
          <li key={table.product_id}>
            <a
              href={tableUrl(table.product_id)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-full flex-col gap-1 rounded-lg border p-3 hover:bg-muted"
            >
              <span className="flex items-start justify-between gap-2 font-medium">
                {table.title_en}
                <ExternalLink
                  className="mt-0.5 size-3 shrink-0 text-muted-foreground"
                  aria-hidden
                />
              </span>
              <span className="text-muted-foreground">
                {tableNumber(table.product_id)} · {table.frequency} ·{' '}
                {coverageYears(table.date_range)}
                {!table.is_active && ' · Archived'}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}
