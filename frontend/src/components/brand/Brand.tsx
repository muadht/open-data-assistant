import { cn } from '@/lib/utils'

// The product's own identity. Deliberately not the Government of Canada signature or the
// Canada wordmark: those are official marks for federal institutions only, and this is a
// prototype. If it becomes an official Statistics Canada service, the official signature
// replaces Logo here, and PRODUCT_NAME and the Prototype label change with it.

export const PRODUCT_NAME = 'Open Data Assistant'

/** A neutral mark: three rising bars, in the app's navy. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={cn('size-7 shrink-0', className)}
    >
      <rect width="24" height="24" rx="6" className="fill-primary" />
      <g className="fill-primary-foreground">
        <rect x="6" y="13" width="3" height="5" rx="1" />
        <rect x="10.5" y="9.5" width="3" height="8.5" rx="1" />
        <rect x="15" y="6" width="3" height="12" rx="1" />
      </g>
    </svg>
  )
}

/** Logo, name, and what it is: a prototype using Statistics Canada data. */
export function Brand() {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <Logo />
      <span className="min-w-0 leading-tight">
        <span className="block truncate font-heading font-bold">
          {PRODUCT_NAME}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          <span className="font-medium text-foreground/70">Prototype</span> ·
          StatCan data
        </span>
      </span>
    </span>
  )
}

/** A maple leaf as decoration, marking the data as Canadian. Our own simplified outline in
 * one colour, not the flag's eleven-point leaf in red: next to the Canada.ca colours, the
 * flag's leaf would make the app look like an official government service. Never the logo. */
export function MapleLeaf({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('size-4 shrink-0', className)}
    >
      <path d="M12 21.5V17l4.5.8-.5-2.3 4.5-4-2-.7 1-3.8-3.5 1.5-1.5-2-2.5-4-2.5 4-1.5 2-3.5-1.5 1 3.8-2 .7 4.5 4-.5 2.3L12 17" />
    </svg>
  )
}
