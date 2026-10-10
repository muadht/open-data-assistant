import { ExternalLink, Loader2, MessageSquare } from 'lucide-react'
import { useEffect, useState } from 'react'
import { coverageYears, tableNumber } from '@/chat/tables'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { tableDetails, type TableDetails } from '@/tables/api'

const MEMBERS_SHOWN = 8

interface Props {
  productId: number | null
  onClose: () => void
  onAsk: (table: { productId: number; title: string }) => void
}

/** A table's details in a side drawer over the page (#56): metadata, its dimensions and
 * their main members, and the ways to use it - ask about it, or open it on StatCan. */
export function TableDrawer({ productId, onClose, onAsk }: Props) {
  const [loaded, setLoaded] = useState<{
    id: number
    details?: TableDetails
    error?: string
  } | null>(null)

  useEffect(() => {
    if (productId === null) return
    const controller = new AbortController()
    tableDetails(productId, controller.signal)
      .then((details) => setLoaded({ id: productId, details }))
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setLoaded({ id: productId, error: String((error as Error).message) })
        }
      })
    return () => controller.abort()
  }, [productId])

  const current = loaded?.id === productId ? loaded : null
  const details = current?.details

  return (
    <Sheet
      open={productId !== null}
      onOpenChange={(open) => !open && onClose()}
    >
      <SheetContent className="w-full gap-0 sm:max-w-lg">
        <SheetHeader className="border-b">
          <SheetTitle className="pr-6 leading-snug">
            {details?.table.title_en ?? 'Table details'}
          </SheetTitle>
          <SheetDescription>
            {productId !== null && tableNumber(productId)}
            {details &&
              ` · ${details.table.frequency} · ${coverageYears(details.table.date_range)}`}
            {details?.table.last_released &&
              ` · updated ${details.table.last_released}`}
            {details && !details.table.is_active && ' · Archived'}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-6 overflow-y-auto p-4 text-sm">
          {!current && (
            <p className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Loading…
            </p>
          )}
          {current?.error && (
            <p role="alert" className="text-destructive">
              {current.error}
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

        <SheetFooter className="flex-row gap-2 border-t">
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
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
