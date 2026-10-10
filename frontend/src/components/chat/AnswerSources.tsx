import { AlertTriangle, ExternalLink } from 'lucide-react'
import { answerDetails } from '@/chat/answerDetails'
import type { AnswerEvent } from '@/chat/events'

/** Source, reference period and quality flags for every series an answer used - always
 * visible, not just the number (docs/mvp-scope.md, accuracy and trust rules). */
export function AnswerSources({ answer }: { answer: AnswerEvent }) {
  const series = answerDetails(answer)
  return (
    <section
      aria-label="Sources"
      className="space-y-3 rounded-lg border bg-card p-3 text-sm"
    >
      {series.map((s) => (
        <div key={s.coordinate} className="space-y-1">
          <a
            href={s.link}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-medium underline underline-offset-2"
          >
            {s.name}
            {s.vectorId !== null && (
              <span className="font-normal text-muted-foreground">
                (v{s.vectorId})
              </span>
            )}
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
                <span className="inline-flex items-start gap-1 text-amber-700 dark:text-amber-400">
                  <AlertTriangle
                    className="mt-0.5 size-4 shrink-0"
                    aria-hidden
                  />
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
      ))}
    </section>
  )
}
