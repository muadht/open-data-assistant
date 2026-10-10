import { useEffect, useRef, useState, type ReactNode } from 'react'
import { WIDE } from '@/lib/breakpoints'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { cn } from '@/lib/utils'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'

interface Props {
  open: boolean
  /** The panel's accessible name: what it's showing. */
  label: string
  onClose: () => void
  /** The panel moves focus to its heading whenever this changes, e.g. to another table. */
  focusKey: string | number
  /** A heading (an h2 with tabIndex -1), a close button and the content. */
  children: ReactNode
}

/** The panel beside the chat (#70, #74), for browsing tables and a table's details, so the
 * conversation stays readable and the input usable while it's open. On narrow screens
 * there's no room beside it, so it opens over the chat instead. */
export function SidePanel(props: Props) {
  return useMediaQuery(WIDE) ? (
    <DockedPanel {...props} />
  ) : (
    <OverlayPanel {...props} />
  )
}

function DockedPanel({ open, label, onClose, focusKey, children }: Props) {
  // The last content stays rendered while the panel slides shut, so it doesn't go blank
  // mid-animation.
  const [shown, setShown] = useState(children)
  if (open && children !== shown) setShown(children)
  const asideRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!open) return
    // The browse list stays mounted, hidden, under a table's details: skip its heading.
    const headings = asideRef.current?.querySelectorAll('h2') ?? []
    Array.from(headings)
      .find((h) => !h.closest('[hidden]'))
      ?.focus()
  }, [open, focusKey])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      // A filter menu open in the panel closes on its own Escape; leave the panel open.
      if (
        event.key === 'Escape' &&
        !document.querySelector('[data-radix-popper-content-wrapper]')
      ) {
        onClose()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  // Growing the panel's width, rather than sliding it over the page, makes the chat beside
  // it narrow along with it. The content keeps its full width and is revealed as it grows.
  return (
    <div
      inert={!open}
      aria-hidden={!open}
      className={cn(
        'shrink-0 overflow-hidden transition-[width] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none',
        open ? 'w-[28rem]' : 'w-0',
      )}
    >
      <aside
        ref={asideRef}
        aria-label={label}
        className={cn(
          'flex h-full w-[28rem] flex-col border-l transition-opacity duration-300 motion-reduce:transition-none',
          open ? 'opacity-100' : 'opacity-0',
        )}
      >
        {shown}
      </aside>
    </div>
  )
}

function OverlayPanel({ open, label, onClose, children }: Props) {
  return (
    <Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <SheetContent
        showCloseButton={false}
        aria-describedby={undefined}
        className="w-full gap-0 sm:max-w-md"
      >
        <SheetTitle className="sr-only">{label}</SheetTitle>
        {children}
      </SheetContent>
    </Sheet>
  )
}
