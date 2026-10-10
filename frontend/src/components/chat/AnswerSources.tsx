import { AlertTriangle, ExternalLink } from 'lucide-react'
import { useState } from 'react'
import { answerDetails, type SeriesDetails } from '@/chat/answerDetails'
import type { AnswerEvent } from '@/chat/events'
import { cn } from '@/lib/utils'

/** A citation chip per series an answer used; clicking one shows its reference period,
 * release date, quality flags and StatCan's notes (docs/mvp-scope.md, trust rules 1-3).
 * Quality flags also show on the chip itself, so they're visible without expanding. */
export function AnswerSources({ answer }: { answer: AnswerEvent }) {
  const series = answerDetails(answer)
  const [open, setOpen] = useState<string | null>(null)
  const selected = series.find((s) => s.coordinate === open)

  return (
    <section aria-label="Sources" className="space-y-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground">Sources</span>
        {series.map((s) => (
          <button
            key={s.coordinate}
            type="button"
            aria-expanded={open === s.coordinate}
            onClick={() => setOpen(open === s.coordinate ? null : s.coordinate)}
            className={cn(
              'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 hover:bg-muted',
              open === s.coordinate && 'bg-muted',
              s.flags.length > 0 &&
                'border-amber-400 text-amber-800 dark:text-amber-300',
            )}
          >
            {s.flags.length > 0 && (
              <AlertTriangle
                className="size-3.5"
                aria-label="Has quality flags"
              />
            )}
            {s.name}
            {s.vectorId !== null && (
              <span className="text-muted-foreground">v{s.vectorId}</span>
            )}
          </button>
        ))}
      </div>
      {selected && <SourceDetails series={selected} />}
    </section>
  )
}

function SourceDetails({ series: s }: { series: SeriesDetails }) {
  return (
    <div className="space-y-2 rounded-lg border bg-card p-3">
      <a
        href={s.link}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 font-medium underline underline-offset-2"
      >
        {s.name}
        {s.vectorId !== null && ` (v${s.vectorId})`}
        <ExternalLink className="size-3" aria-hidden />
      </a>
      <p className="text-muted-foreground">
        Statistics Canada, table{' '}
        <a
          href={s.table.link}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2"
        >
          {s.table.title} ({s.table.productId})
        </a>
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 text-muted-foreground">
        <dt>Reference period</dt>
        <dd>{s.periodsUsed.join(', ')}</dd>
        <dt>Released</dt>
        <dd>{s.releasedOn.join(', ')}</dd>
        <dt>Quality flags</dt>
        <dd>
          {s.flags.length ? (
            <span className="text-amber-700 dark:text-amber-400">
              {s.flags.join('; ')}
            </span>
          ) : (
            'None'
          )}
        </dd>
      </dl>
      {s.footnotes.length > 0 && (
        <details className="text-muted-foreground">
          <summary className="cursor-pointer">
            StatCan notes ({s.footnotes.length})
          </summary>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {s.footnotes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
