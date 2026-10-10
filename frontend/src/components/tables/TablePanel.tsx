import { X } from 'lucide-react'
import { useEffect, useRef, useSyncExternalStore } from 'react'
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
  const loaded = useTableDetails(productId)
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

  if (productId === null) return null
  return (
    <aside
      aria-labelledby="table-panel-title"
      className="flex w-[26rem] shrink-0 flex-col border-l"
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
            {tableSummary(productId, details)}
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
        <TableActions productId={productId} details={details} onAsk={onAsk} />
      </footer>
    </aside>
  )
}
