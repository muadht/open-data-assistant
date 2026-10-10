import { ExternalLink, Loader2, MessageSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { TableDetails } from '@/tables/api'
import type { LoadedDetails } from '@/tables/details'

// A table's details, shared by the browse page's drawer (TableDrawer) and the chat's side
// panel (TablePanel, #70): each frames the same pieces in its own container.

const MEMBERS_SHOWN = 8

/** Subjects and dimensions, with loading and error states. */
export function TableStructure({ loaded }: { loaded: LoadedDetails | null }) {
  const details = loaded?.details
  return (
    <div className="flex-1 space-y-6 overflow-y-auto p-4 text-sm">
      {!loaded && (
        <p className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Loading…
        </p>
      )}
      {loaded?.error && (
        <p role="alert" className="text-destructive">
          {loaded.error}
        </p>
      )}
      {details && (
        <>
          {details.subjects.length > 0 && (
            <section className="space-y-1">
              <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Subjects
              </h3>
              <ul className="space-y-0.5">
                {details.subjects
                  .filter(
                    (s) =>
                      !details.subjects.some((other) =>
                        other.startsWith(s + '/'),
                      ),
                  )
                  .map((s) => (
                    <li key={s}>{s.split('/').join(' › ')}</li>
                  ))}
              </ul>
            </section>
          )}
          <section className="space-y-3">
            <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              What's in it
            </h3>
            {details.structure.dimensions.map((d) => {
              const shown = d.members.slice(0, MEMBERS_SHOWN)
              const more = d.member_count - shown.length
              return (
                <div key={d.dimension_position_id} className="space-y-1.5">
                  <p className="font-medium">
                    {d.name_en}{' '}
                    <span className="font-normal text-muted-foreground">
                      ({d.member_count})
                    </span>
                  </p>
                  <ul className="flex flex-wrap gap-1.5">
                    {shown.map((m) => (
                      <li
                        key={m.member_id}
                        className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground"
                      >
                        {m.name_en}
                      </li>
                    ))}
                    {more > 0 && (
                      <li className="px-1 py-0.5 text-xs text-muted-foreground">
                        +{more} more
                      </li>
                    )}
                  </ul>
                </div>
              )
            })}
          </section>
        </>
      )}
    </div>
  )
}

/** Ask about this table, and View on StatCan. */
export function TableActions({
  productId,
  details,
  onAsk,
}: {
  productId: number | null
  details: TableDetails | undefined
  onAsk: (table: { productId: number; title: string }) => void
}) {
  return (
    <>
      <Button
        className="flex-1"
        disabled={!details}
        onClick={() =>
          details &&
          onAsk({
            productId: details.table.product_id,
            title: details.table.title_en,
          })
        }
      >
        <MessageSquare aria-hidden />
        Ask about this table
      </Button>
      <Button variant="outline" asChild>
        <a
          href={
            details?.source_url ??
            `https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=${productId}01`
          }
          target="_blank"
          rel="noopener noreferrer"
        >
          View on StatCan
          <ExternalLink aria-hidden />
        </a>
      </Button>
    </>
  )
}
