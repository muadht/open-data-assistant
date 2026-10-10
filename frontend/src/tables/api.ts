// Client for the catalogue endpoints in docs/tables-api.md (#56).
import type { TableCandidate } from '@/chat/events'

export interface FacetValue {
  value: string
  count: number
}

export interface TableSearchResponse {
  total: number
  page: number
  page_size: number
  results: TableCandidate[]
  facets: {
    subjects: FacetValue[]
    /** Every subject at any level, for searching subjects by name. */
    all_subjects: FacetValue[]
    frequencies: FacetValue[]
    active: number
    archived: number
  }
}

export interface MemberCandidate {
  member_id: number
  name_en: string
  parent_member_id: number | null
  terminated: boolean
}

export interface TableDetails {
  table: TableCandidate
  subjects: string[]
  structure: {
    dimensions: {
      dimension_position_id: number
      name_en: string
      members: MemberCandidate[]
      member_count: number
    }[]
    frequency: string
    is_census_table: boolean
  }
  source_url: string
}

/** The browse page's state, as it appears in the URL (#/browse?q=...&frequency=...). */
export interface BrowseParams {
  q: string
  subject: string
  frequency: string
  from: string
  to: string
  includeArchived: boolean
  sort: 'relevance' | 'updated'
}

export const EMPTY_BROWSE: BrowseParams = {
  q: '',
  subject: '',
  frequency: '',
  from: '',
  to: '',
  includeArchived: false,
  sort: 'relevance',
}

export function browseParamsFrom(search: URLSearchParams): BrowseParams {
  return {
    q: search.get('q') ?? '',
    subject: search.get('subject') ?? '',
    frequency: search.get('frequency') ?? '',
    from: search.get('from') ?? '',
    to: search.get('to') ?? '',
    includeArchived: search.get('include_archived') === 'true',
    sort: search.get('sort') === 'updated' ? 'updated' : 'relevance',
  }
}

export function browseSearchParams(params: BrowseParams): URLSearchParams {
  const search = new URLSearchParams()
  if (params.q) search.set('q', params.q)
  if (params.subject) search.set('subject', params.subject)
  if (params.frequency) search.set('frequency', params.frequency)
  if (params.from) search.set('from', params.from)
  if (params.to) search.set('to', params.to)
  if (params.includeArchived) search.set('include_archived', 'true')
  if (params.sort !== 'relevance') search.set('sort', params.sort)
  return search
}

const base = () => import.meta.env.VITE_API_BASE ?? ''

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${base()}${path}`, { signal })
  if (!response.ok) {
    let detail = `Something went wrong (HTTP ${response.status}).`
    try {
      const body: unknown = await response.json()
      if (body && typeof body === 'object' && 'detail' in body) {
        detail = String(body.detail)
      }
    } catch {
      // Not JSON - keep the generic message.
    }
    throw new Error(detail)
  }
  return (await response.json()) as T
}

export function searchTables(
  params: BrowseParams,
  page: number,
  signal?: AbortSignal,
): Promise<TableSearchResponse> {
  const search = browseSearchParams(params)
  search.set('page', String(page))
  return getJson(`/tables/search?${search}`, signal)
}

export function tableDetails(
  productId: number,
  signal?: AbortSignal,
): Promise<TableDetails> {
  return getJson(`/tables/${productId}`, signal)
}
