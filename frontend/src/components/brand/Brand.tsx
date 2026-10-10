import { ChartSpline } from 'lucide-react'
import { cn } from '@/lib/utils'

// The product's own identity. Deliberately not the Government of Canada signature or the
// Canada wordmark: those are official marks for federal institutions only, and this is a
// prototype. If it becomes an official Statistics Canada service, the official signature
// replaces Logo here, and PRODUCT_NAME and the Prototype label change with it.
// See docs/visual-identity.md for what the UI may and may not use, and why.

export const PRODUCT_NAME = 'Open Data Assistant'

/** A neutral mark: Lucide's line chart, in the primary colour (navy, pale navy in dark mode). */
export function Logo({ className }: { className?: string }) {
  return (
    <ChartSpline
      aria-hidden
      strokeWidth={2.25}
      className={cn('size-6 shrink-0 text-primary', className)}
    />
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

// The stylized 11-point maple leaf, traced from Canadian Heritage's official artwork
// (https://www.canada.ca/en/canadian-heritage/services/commercial-use-symbols-canada.html,
// "Maple leaf files", MapleLeaf.eps). Protected under s. 9 of the Trademarks Act against
// unauthorized *commercial* use: this is a free prototype, but if it ever generates
// revenue, ask Canadian Heritage first (uds-uos@pch.gc.ca). Used as decoration marking the
// data as Canadian, never as the logo.
const MAPLE_LEAF_PATH =
  'M158.435 324C158.435 324 155.795 259.551 155.795 253.159C155.795 246.718 161.329 244.54 167.866 245.902C174.45 247.353 235.949 259.551 235.949 259.551C235.949 259.551 231.269 246.535 227.977 236.874C224.732 227.215 228.996 225.492 231.269 223.497L300 165.215L289.154 160.001C282.573 156.984 283.594 151.564 284.613 147.958L296.569 106.755C296.569 106.755 267.929 113.082 261.207 114.079C255.879 114.896 254.022 112.47 252.357 108.841L243.781 88.7954L207.862 127.527C201.099 133.559 194.563 128.933 195.767 121.903C196.925 115.508 213.794 39.4053 213.794 39.4053C213.794 39.4053 195.166 50.2446 189 53.8725C182.86 57.478 179.569 56.8652 176.302 51.061C173.009 45.2319 150.001 0 150.001 0C150.001 0 126.988 45.2319 123.723 51.061C120.431 56.8652 117.165 57.478 111 53.8725C104.836 50.2446 86.2046 39.4053 86.2046 39.4053C86.2046 39.4053 103.122 115.508 104.233 121.903C105.462 128.933 98.9038 133.559 92.1377 127.527L56.2173 88.7954L47.6211 108.841C45.9756 112.47 44.145 114.896 38.793 114.079C32.0957 113.082 2.272 106.755 2.272 106.755L15.3867 147.958C16.4082 151.564 17.4268 156.984 10.8696 160.001L0 165.215L68.731 223.497C71.002 225.492 75.3135 227.215 72.023 236.874C68.731 246.535 64.0264 259.551 64.0264 259.551C64.0264 259.551 125.577 247.353 132.133 245.902C138.715 244.54 144.229 246.718 144.229 253.159C144.229 259.551 141.565 324 141.565 324L158.435 324Z'

/** The official maple leaf, filled with the current text colour. */
export function MapleLeaf({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 300 324"
      aria-hidden
      fill="currentColor"
      className={cn('size-4 shrink-0', className)}
    >
      <path d={MAPLE_LEAF_PATH} />
    </svg>
  )
}
