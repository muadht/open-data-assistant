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
  type FacetValue,
  type TableSearchResponse,
} from '@/tables/api'
import { cn } from '@/lib/utils'
import { PanelClose } from './PanelClose'
import { TableCard } from './TableCard'

interface Props {
  params: BrowseParams
  onParamsChange: (params: BrowseParams) => void
  onOpenTable: (productId: number) => void
  onClose: () => void
}

interface Loaded {
  key: string
  pages: TableCandidate[]
  response: TableSearchResponse
}

/** Find tables yourself (#56), in the panel beside the chat (#74): search, filters with
 * counts, and results that open the table's details. The panel is narrow, so the controls
 * stay fixed above a scrolling list and the secondary ones (archived, sort) sit in the
 * result line. The filters live in the URL, so a view can be shared or bookmarked. */
export function BrowsePane({
  params,
  onParamsChange,
  onOpenTable,
  onClose,
}: Props) {
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
    <>
      <header className="flex items-center gap-2 border-b p-4">
        <h2 tabIndex={-1} className="flex-1 font-semibold focus:outline-none">
          Browse tables
        </h2>
        <PanelClose label="Close browse tables" onClose={onClose} />
      </header>

      <div className="space-y-3 border-b p-4">
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault()
            set({ q: draft.trim() })
          }}
          className="relative"
        >
          <Search
            className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            type="search"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Search tables, e.g. consumer prices"
            aria-label="Search tables"
            enterKeyHint="search"
            className="h-9 w-full rounded-full border bg-background pr-4 pl-9 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
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
            {facets && (
              <SubjectPicker
                selected={params.subject}
                level={facets.subjects}
                all={facets.all_subjects}
                onPick={(subject) => set({ subject })}
              />
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
                  set({
                    frequency: params.frequency === f.value ? '' : f.value,
                  })
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
        </div>

        {/* The result line: the count, then the secondary controls as small text. */}
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>
            {current &&
              (params.q
                ? `Top ${current.response.total} matches`
                : `${current.response.total.toLocaleString('en-CA')} ${current.response.total === 1 ? 'table' : 'tables'}`)}
          </span>
          {facets && (params.includeArchived || facets.archived > 0) && (
            <button
              type="button"
              onClick={() => set({ includeArchived: !params.includeArchived })}
              className="hover:text-foreground hover:underline"
            >
              {params.includeArchived
                ? 'Hide archived'
                : `Show ${facets.archived.toLocaleString('en-CA')} archived`}
            </button>
          )}
          {filtered && (
            <button
              type="button"
              onClick={() => onParamsChange({ ...EMPTY_BROWSE, q: params.q })}
              className="hover:text-foreground hover:underline"
            >
              Clear filters
            </button>
          )}
          {/* Without search text there's nothing to rank by relevance: always newest first. */}
          {params.q && (
            <select
              value={params.sort}
              onChange={(e) =>
                set({ sort: e.target.value as BrowseParams['sort'] })
              }
              aria-label="Sort"
              className="ml-auto rounded border-0 bg-transparent py-0.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <option value="relevance">Most relevant</option>
              <option value="updated">Recently updated</option>
            </select>
          )}
        </p>
      </div>

      <section aria-label="Results" className="min-h-0 flex-1 overflow-y-auto">
        {error && (
          <p role="status" className="p-4 text-sm text-muted-foreground">
            {error}
          </p>
        )}
        {current?.pages.length === 0 && (
          <p className="p-8 text-center text-sm text-muted-foreground">
            No tables match. Try fewer filters or different words.
          </p>
        )}
        {current && current.pages.length > 0 && (
          <ul className="divide-y">
            {current.pages.map((table) => (
              <li key={table.product_id}>
                <TableCard table={table} onOpen={onOpenTable} />
              </li>
            ))}
          </ul>
        )}
        {loading && (
          <p className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Loading…
          </p>
        )}
        {current &&
          !loading &&
          current.pages.length < current.response.total && (
            <div className="flex justify-center border-t p-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPage({ key, number: pageNumber + 1 })}
              >
                Load more
              </Button>
            </div>
          )}
      </section>
    </>
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

/** The subject filter: a search box over every subject at any level, or - with the box
 * empty - StatCan's hierarchy one level at a time, with a trail back up. */
function SubjectPicker({
  selected,
  level,
  all,
  onPick,
}: {
  selected: string
  level: FacetValue[]
  all: FacetValue[]
  onPick: (subject: string) => void
}) {
  const [search, setSearch] = useState('')
  const terms = search.trim().toLowerCase()
  const matches = terms
    ? // Match each subject on its own name, not its parents': otherwise "consumer" also
      // finds every child of "Business and consumer services and culture".
      all
        .filter((f) => f.value.split('/').at(-1)!.toLowerCase().includes(terms))
        .slice(0, 50)
    : []
  return (
    <div className="space-y-1">
      <input
        autoFocus
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search subjects"
        aria-label="Search subjects"
        className="mb-1 w-full rounded-md border bg-background px-2 py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      {terms ? (
        <>
          {matches.map((f) => (
            <FilterOption
              key={f.value}
              label={f.value.split('/').join(' › ')}
              count={f.count}
              selected={selected === f.value}
              onClick={() => onPick(f.value)}
            />
          ))}
          {matches.length === 0 && (
            <p className="px-2 py-1 text-muted-foreground">
              No matching subjects.
            </p>
          )}
        </>
      ) : (
        <>
          {selected && <SubjectTrail subject={selected} onPick={onPick} />}
          {level.map((f) => (
            <FilterOption
              key={f.value}
              label={f.value.split('/').at(-1)!}
              count={f.count}
              onClick={() => onPick(f.value)}
            />
          ))}
          {level.length === 0 && (
            <p className="px-2 py-1 text-muted-foreground">
              No narrower subjects.
            </p>
          )}
        </>
      )}
    </div>
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
