import { ArrowLeft, ExternalLink, Loader2, MessageSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { TableDetails } from '@/tables/api'
import {
  tableSummary,
  useTableDetails,
  type LoadedDetails,
} from '@/tables/details'
import { PanelClose } from './PanelClose'

const MEMBERS_SHOWN = 8

/** A table's details in the side panel (#70): what it is, its dimensions and their main
 * members, and the ways to use it - ask about it, or open it on StatCan. `onBack` returns
 * to the browse list it was opened from (#74). */
export function TableDetailsPane({
  productId,
  onBack,
  onClose,
  onAsk,
}: {
  productId: number
  onBack?: () => void
  onClose: () => void
  onAsk: (table: { productId: number; title: string }) => void
}) {
  const loaded = useTableDetails(productId)
  const details = loaded?.details
  return (
    <>
      <header className="space-y-2 border-b p-4">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="-ml-1 inline-flex items-center gap-1 rounded px-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" aria-hidden />
            Back to results
          </button>
        )}
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1 space-y-1">
            <h2
              tabIndex={-1}
              className="leading-snug font-semibold focus:outline-none"
            >
              {details?.table.title_en ?? 'Table details'}
            </h2>
            <p className="text-sm text-muted-foreground">
              {tableSummary(productId, details)}
            </p>
          </div>
          <PanelClose label="Close table details" onClose={onClose} />
        </div>
      </header>
      <TableStructure loaded={loaded} />
      <footer className="flex gap-2 border-t p-4">
        <TableActions productId={productId} details={details} onAsk={onAsk} />
      </footer>
    </>
  )
}

/** Subjects and dimensions, with loading and error states. */
function TableStructure({ loaded }: { loaded: LoadedDetails | null }) {
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
        <p role="status" className="text-muted-foreground">
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
function TableActions({
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
