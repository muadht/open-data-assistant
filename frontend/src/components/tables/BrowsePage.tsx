import { ChevronDown, Loader2, Search, X } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import type { TableCandidate } from '@/chat/events'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  EMPTY_BROWSE,
  searchTables,
  type BrowseParams,
  type TableSearchResponse,
} from '@/tables/api'
import { cn } from '@/lib/utils'
import { TableCard } from './TableCard'

interface Props {
  params: BrowseParams
  onParamsChange: (params: BrowseParams) => void
  onOpenTable: (productId: number) => void
}

interface Loaded {
  key: string
  pages: TableCandidate[]
  response: TableSearchResponse
}

/** Find tables yourself (#56): search, filters with counts, and results that open the
 * table's details. The filters live in the URL, so a view can be shared or bookmarked. */
export function BrowsePage({ params, onParamsChange, onOpenTable }: Props) {
  const key = JSON.stringify(params)
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [page, setPage] = useState({ key, number: 1 })
  const [failed, setFailed] = useState<{ key: string; message: string } | null>(
    null,
  )
  const [draft, setDraft] = useState(params.q)

  const pageNumber = page.key === key ? page.number : 1

  useEffect(() => {
    const controller = new AbortController()
    // Read from `key` (the filters, serialised) so the effect reruns exactly when they change.
    const filters = JSON.parse(key) as BrowseParams
    searchTables(filters, pageNumber, controller.signal)
      .then((response) =>
        setLoaded((previous) => ({
          key,
          response,
          pages:
            pageNumber > 1 && previous?.key === key
              ? [...previous.pages, ...response.results]
              : response.results,
        })),
      )
      .catch((e: unknown) => {
        if (!controller.signal.aborted) {
          setFailed({ key, message: (e as Error).message })
        }
      })
    return () => controller.abort()
  }, [key, pageNumber])

  const current = loaded?.key === key ? loaded : null
  const error = failed?.key === key ? failed.message : null
  const loading = !error && (!current || current.response.page < pageNumber)
  const set = (changes: Partial<BrowseParams>) =>
    onParamsChange({ ...params, ...changes })
  const filtered =
    params.subject ||
    params.frequency ||
    params.from ||
    params.to ||
    params.includeArchived

  const facets = current?.response.facets
  const years =
    params.from || params.to
      ? `${params.from || '…'}–${params.to || '…'}`
      : null

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 px-4 py-6">
      <form
        role="search"
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          set({ q: draft.trim() })
        }}
      >
        <div className="relative flex-1">
          <Search
            className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Search StatCan tables, e.g. consumer prices"
            aria-label="Search tables"
            className="h-10 w-full rounded-full border bg-background pr-4 pl-9 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <Button type="submit" className="rounded-full">
          Search
        </Button>
      </form>

      {/* One row of filters: each a compact button showing its value, opening a menu. */}
      <div
        role="group"
        aria-label="Filters"
        className="flex flex-wrap items-center gap-2 text-sm"
      >
        <FilterMenu
          label="Subject"
          value={params.subject.split('/').at(-1) || null}
          onClear={() => set({ subject: '' })}
        >
          {params.subject && (
            <SubjectTrail
              subject={params.subject}
              onPick={(subject) => set({ subject })}
            />
          )}
          {facets?.subjects.map((f) => (
            <FilterOption
              key={f.value}
              label={f.value.split('/').at(-1)!}
              count={f.count}
              onClick={() => set({ subject: f.value })}
            />
          ))}
          {facets && facets.subjects.length === 0 && (
            <p className="px-2 py-1 text-muted-foreground">
              No narrower subjects.
            </p>
          )}
        </FilterMenu>
        <FilterMenu
          label="Frequency"
          value={params.frequency || null}
          onClear={() => set({ frequency: '' })}
        >
          {facets?.frequencies.map((f) => (
            <FilterOption
              key={f.value}
              label={f.value}
              count={f.count}
              selected={params.frequency === f.value}
              onClick={() =>
                set({ frequency: params.frequency === f.value ? '' : f.value })
              }
            />
          ))}
        </FilterMenu>
        <FilterMenu
          label="Years"
          value={years}
          onClear={() => set({ from: '', to: '' })}
        >
          <p className="px-2 pb-1 text-xs text-muted-foreground">
            Tables covering any year in this range
          </p>
          <YearRange
            from={params.from}
            to={params.to}
            onChange={(from, to) => set({ from, to })}
          />
        </FilterMenu>
        <label className="flex items-center gap-1.5 px-2 text-muted-foreground">
          <input
            type="checkbox"
            checked={params.includeArchived}
            onChange={(e) => set({ includeArchived: e.target.checked })}
          />
          Include archived
        </label>
        <label className="ml-auto flex items-center gap-2 text-muted-foreground">
          Sort
          <select
            // Without search text there's nothing to rank by relevance.
            value={params.q ? params.sort : 'updated'}
            onChange={(e) =>
              set({ sort: e.target.value as BrowseParams['sort'] })
            }
            className="rounded-md border bg-background px-2 py-1 text-foreground"
          >
            {params.q && <option value="relevance">Most relevant</option>}
            <option value="updated">Recently updated</option>
          </select>
        </label>
      </div>

      <section aria-label="Results" className="space-y-3">
        <p className="flex items-center gap-3 text-sm text-muted-foreground">
          <span>
            {current &&
              (params.q
                ? `Top ${current.response.total} matches`
                : `${current.response.total.toLocaleString('en-CA')} ${current.response.total === 1 ? 'table' : 'tables'}`)}
          </span>
          {filtered && (
            <button
              type="button"
              onClick={() => onParamsChange({ ...EMPTY_BROWSE, q: params.q })}
              className="hover:text-foreground hover:underline"
            >
              Clear filters
            </button>
          )}
        </p>

        {error && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}
        {current?.pages.length === 0 && (
          <p className="py-8 text-center text-muted-foreground">
            No tables match. Try fewer filters or different words.
          </p>
        )}
        {current && current.pages.length > 0 && (
          <ul className="divide-y overflow-hidden rounded-lg border">
            {current.pages.map((table) => (
              <li key={table.product_id}>
                <TableCard table={table} onOpen={onOpenTable} />
              </li>
            ))}
          </ul>
        )}
        {loading && (
          <p className="flex items-center justify-center gap-2 py-4 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Loading…
          </p>
        )}
        {current &&
          !loading &&
          current.pages.length < current.response.total && (
            <div className="flex justify-center pt-2">
              <Button
                variant="outline"
                onClick={() => setPage({ key, number: pageNumber + 1 })}
              >
                Load more
              </Button>
            </div>
          )}
      </section>
    </div>
  )
}

/** One filter as a compact button: its label, or its value once set (with ✕ to clear),
 * opening a small menu of options. */
function FilterMenu({
  label,
  value,
  onClear,
  children,
}: {
  label: string
  value: string | null
  onClear: () => void
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <span
        className={cn(
          'inline-flex items-center rounded-full border',
          value && 'border-foreground/30 bg-muted',
        )}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-full py-1 pr-2 pl-3 hover:text-foreground"
          >
            <span className={cn(!value && 'text-muted-foreground')}>
              {value ? `${label}: ${value}` : label}
            </span>
            <ChevronDown
              className="size-3.5 text-muted-foreground"
              aria-hidden
            />
          </button>
        </PopoverTrigger>
        {value && (
          <button
            type="button"
            onClick={onClear}
            aria-label={`Clear ${label.toLowerCase()}`}
            className="mr-1 rounded-full p-0.5 text-muted-foreground hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        )}
      </span>
      <PopoverContent
        align="start"
        className="max-h-80 w-72 overflow-y-auto p-1 text-sm"
        // Picking an option changes the filters; close the menu as it does.
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('button')) setOpen(false)
        }}
      >
        {children}
      </PopoverContent>
    </Popover>
  )
}

function FilterOption({
  label,
  count,
  selected = false,
  onClick,
}: {
  label: string
  count: number
  selected?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        'flex w-full items-baseline justify-between gap-2 rounded px-2 py-1 text-left hover:bg-muted',
        selected && 'bg-muted font-medium',
      )}
    >
      <span>{label}</span>
      <span className="text-xs text-muted-foreground tabular-nums">
        {count}
      </span>
    </button>
  )
}

/** "All subjects › Prices and price indexes › …": each step goes back up the hierarchy. */
function SubjectTrail({
  subject,
  onPick,
}: {
  subject: string
  onPick: (subject: string) => void
}) {
  const parts = subject.split('/')
  return (
    <nav aria-label="Selected subject" className="space-y-1 pb-1">
      <button
        type="button"
        onClick={() => onPick('')}
        className="px-2 text-muted-foreground hover:text-foreground"
      >
        All subjects
      </button>
      {parts.map((part, i) => (
        <button
          key={part}
          type="button"
          onClick={() => onPick(parts.slice(0, i + 1).join('/'))}
          aria-current={i === parts.length - 1 ? 'true' : undefined}
          className={cn(
            'block px-2 text-left hover:text-foreground',
            i === parts.length - 1 ? 'font-medium' : 'text-muted-foreground',
          )}
          style={{ paddingLeft: `${0.5 + (i + 1) * 0.75}rem` }}
        >
          {part}
        </button>
      ))}
    </nav>
  )
}

function YearRange({
  from,
  to,
  onChange,
}: {
  from: string
  to: string
  onChange: (from: string, to: string) => void
}) {
  const [draft, setDraft] = useState({ from, to })
  const apply = () => {
    if (draft.from !== from || draft.to !== to) onChange(draft.from, draft.to)
  }
  return (
    <div className="flex items-center gap-2 px-2">
      {(['from', 'to'] as const).map((end) => (
        <input
          key={end}
          type="number"
          inputMode="numeric"
          min={1800}
          max={2200}
          placeholder={end === 'from' ? 'From' : 'To'}
          aria-label={end === 'from' ? 'From year' : 'To year'}
          value={draft[end]}
          onChange={(e) => setDraft({ ...draft, [end]: e.target.value })}
          onBlur={apply}
          onKeyDown={(e) => e.key === 'Enter' && apply()}
          className="w-20 rounded-md border bg-background px-2 py-1"
        />
      ))}
    </div>
  )
}
