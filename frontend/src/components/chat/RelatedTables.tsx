import { useState } from 'react'
import type { TableCandidate } from '@/chat/events'
import { coverageYears, tableNumber } from '@/chat/tables'
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card'

const VISIBLE = 3

/** Other tables that may interest the user, as one row of small chips. Secondary
 * information: titles are truncated, and hovering a chip shows the full title and
 * metadata. Clicking a chip opens the table's details drawer (#56). */
export function RelatedTables({
  tables,
  onOpen,
}: {
  tables: TableCandidate[]
  onOpen: (productId: number) => void
}) {
  const [showAll, setShowAll] = useState(false)
  if (!tables.length) return null
  const shown = showAll ? tables : tables.slice(0, VISIBLE)
  const hidden = tables.length - shown.length

  return (
    <section
      aria-label="Related tables"
      className="flex flex-wrap items-center gap-1.5 text-xs"
    >
      <span className="mr-0.5 text-muted-foreground">Related</span>
      {shown.map((table) => (
        <RelatedChip key={table.product_id} table={table} onOpen={onOpen} />
      ))}
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="rounded-full px-2 py-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          +{hidden} more
        </button>
      )}
    </section>
  )
}

function RelatedChip({
  table,
  onOpen,
}: {
  table: TableCandidate
  onOpen: (productId: number) => void
}) {
  const details = `${tableNumber(table.product_id)} · ${table.frequency} · ${coverageYears(table.date_range)}${table.is_active ? '' : ' · Archived'}`
  return (
    <HoverCard openDelay={300} closeDelay={100}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          onClick={() => onOpen(table.product_id)}
          // The hover card is for pointer users; this gives keyboard and screen-reader
          // users the same information.
          aria-label={`${table.title_en}, ${details}`}
          className="max-w-56 truncate rounded-full border px-2 py-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          {table.title_en}
        </button>
      </HoverCardTrigger>
      <HoverCardContent className="w-80 space-y-1 text-sm">
        <p className="font-medium">{table.title_en}</p>
        <p className="text-muted-foreground">{details}</p>
        {table.subjects.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {table.subjects.at(-1)?.split('/').join(' › ')}
          </p>
        )}
        <p className="text-xs text-muted-foreground">Click for details</p>
      </HoverCardContent>
    </HoverCard>
  )
}
