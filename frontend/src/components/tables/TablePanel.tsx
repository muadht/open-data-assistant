import { X } from 'lucide-react'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { cn } from '@/lib/utils'
import { tableSummary, useTableDetails } from '@/tables/details'
import { TableActions, TableStructure } from './TableDetails'
import { TableDrawer } from './TableDrawer'

const WIDE = '(min-width: 1024px)'

function useIsWide(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia(WIDE)
      query.addEventListener('change', onChange)
      return () => query.removeEventListener('change', onChange)
    },
    () => window.matchMedia(WIDE).matches,
  )
}

interface Props {
  productId: number | null
  onClose: () => void
  onAsk: (table: { productId: number; title: string }) => void
}

/** A table's details beside the chat (#70), so the conversation stays readable and the
 * input usable while it's open. On narrow screens there's no room beside it, so it's the
 * browse page's drawer over the chat instead. */
export function TablePanel(props: Props) {
  return useIsWide() ? <DockedPanel {...props} /> : <TableDrawer {...props} />
}

function DockedPanel({ productId, onClose, onAsk }: Props) {
  // The last table opened stays rendered while the panel slides shut, so it doesn't go blank
  // mid-animation.
  const [shownId, setShownId] = useState(productId)
  if (productId !== null && productId !== shownId) setShownId(productId)
  const open = productId !== null
  const loaded = useTableDetails(shownId)
  const details = loaded?.details
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (productId !== null) headingRef.current?.focus()
  }, [productId])

  useEffect(() => {
    if (productId === null) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [productId, onClose])

  // Growing the panel's width, rather than sliding it over the page, makes the chat beside
  // it narrow along with it. The content keeps its full width and is revealed as it grows.
  return (
    <div
      inert={!open}
      aria-hidden={!open}
      className={cn(
        'shrink-0 overflow-hidden transition-[width] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none',
        open ? 'w-[26rem]' : 'w-0',
      )}
    >
      {shownId !== null && (
        <aside
          aria-labelledby="table-panel-title"
          className={cn(
            'flex h-full w-[26rem] flex-col border-l transition-opacity duration-300 motion-reduce:transition-none',
            open ? 'opacity-100' : 'opacity-0',
          )}
        >
          <header className="flex items-start gap-2 border-b p-4">
            <div className="min-w-0 flex-1 space-y-1">
              <h2
                id="table-panel-title"
                ref={headingRef}
                tabIndex={-1}
                className="leading-snug font-semibold focus:outline-none"
              >
                {details?.table.title_en ?? 'Table details'}
              </h2>
              <p className="text-sm text-muted-foreground">
                {tableSummary(shownId, details)}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close table details"
              className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </header>
          <TableStructure loaded={loaded} />
          <footer className="flex gap-2 border-t p-4">
            <TableActions productId={shownId} details={details} onAsk={onAsk} />
          </footer>
        </aside>
      )}
    </div>
  )
}
