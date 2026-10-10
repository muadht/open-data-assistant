import type { TableCandidate } from '@/chat/events'
import { coverageYears, tableNumber } from '@/chat/tables'

/** One table in the browse results: title, then a quiet line of metadata. The whole card
 * opens the table's details. */
export function TableCard({
  table,
  onOpen,
}: {
  table: TableCandidate
  onOpen: (productId: number) => void
}) {
  const subject = table.subjects.at(-1)?.split('/').join(' › ')
  return (
    <button
      type="button"
      onClick={() => onOpen(table.product_id)}
      className="w-full space-y-1 rounded-lg border px-4 py-3 text-left hover:bg-muted"
    >
      <p className="leading-snug font-medium">{table.title_en}</p>
      <p className="text-xs text-muted-foreground">
        {tableNumber(table.product_id)} · {table.frequency} ·{' '}
        {coverageYears(table.date_range)}
        {table.last_released && ` · updated ${table.last_released}`}
        {!table.is_active && (
          <span className="ml-2 rounded bg-muted px-1.5 py-0.5">Archived</span>
        )}
      </p>
      {subject && <p className="text-xs text-muted-foreground">{subject}</p>}
    </button>
  )
}
