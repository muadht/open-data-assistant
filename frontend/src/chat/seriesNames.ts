import type { DataResult } from './events'

/** Names that tell series apart: the members that differ between them (e.g. just
 * "Alberta" / "Ontario"), or all members for a single series. Shared by charts and
 * citations, so a series is called the same thing in both. */
export function distinguishingNames(results: DataResult[]): string[] {
  if (!results.length) return []
  const dimensions = Object.keys(results[0].members)
  const varying =
    results.length === 1
      ? dimensions
      : dimensions.filter(
          (d) => new Set(results.map((r) => r.members[d])).size > 1,
        )
  return results.map((r) =>
    varying.length
      ? varying.map((d) => r.members[d]).join(' · ')
      : r.series_title_en,
  )
}

/** The members every series has in common, e.g. ["All-items"] for a CPI comparison; empty
 * for a single series (its name already has them all). */
export function sharedMembers(results: DataResult[]): string[] {
  if (results.length < 2) return []
  return Object.keys(results[0].members)
    .filter((d) => new Set(results.map((r) => r.members[d])).size === 1)
    .map((d) => results[0].members[d])
}
