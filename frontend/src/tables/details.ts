import { useEffect, useState } from 'react'
import { coverageYears, tableNumber } from '@/chat/tables'
import { tableDetails, type TableDetails } from './api'

export interface LoadedDetails {
  details?: TableDetails
  error?: string
}

/** The details of `productId`, or null while they load. */
export function useTableDetails(
  productId: number | null,
): LoadedDetails | null {
  const [loaded, setLoaded] = useState<(LoadedDetails & { id: number }) | null>(
    null,
  )

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

  return loaded?.id === productId ? loaded : null
}

/** "18-10-0006-01 · Monthly · 1992–2026 · updated 2026-09-14". */
export function tableSummary(
  productId: number,
  details: TableDetails | undefined,
): string {
  let summary = tableNumber(productId)
  if (details) {
    summary += ` · ${details.table.frequency} · ${coverageYears(details.table.date_range)}`
    if (details.table.last_released) {
      summary += ` · updated ${details.table.last_released}`
    }
    if (!details.table.is_active) summary += ' · Archived'
  }
  return summary
}
