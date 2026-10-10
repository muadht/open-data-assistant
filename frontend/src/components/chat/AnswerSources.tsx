import { AlertTriangle, ChevronRight, ExternalLink } from 'lucide-react'
import type { CitedSource, Citations } from '@/chat/citations'
import { tableNumber } from '@/chat/tables'
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card'

/** A numbered citation in the answer text: a small superscript that links to the source and
 * shows it on hover. Its accessible name carries the same details for keyboard and
 * screen-reader users. */
export function CitationMarker({ source }: { source: CitedSource }) {
  return (
    <HoverCard openDelay={150} closeDelay={100}>
      <HoverCardTrigger asChild>
        <a
          href={source.link}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Source ${source.number}: ${source.shortName}, ${source.periodsUsed.join(', ')}${source.flags.length ? `, flagged: ${source.flags.join('; ')}` : ''}`}
          className={
            'ml-0.5 inline-flex min-w-4 -translate-y-1 items-center justify-center rounded px-1 align-baseline text-[0.65rem] leading-4 font-medium no-underline hover:bg-foreground hover:text-background ' +
            (source.flags.length
              ? 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200'
              : 'bg-muted text-muted-foreground')
          }
        >
          {source.number}
        </a>
      </HoverCardTrigger>
      <HoverCardContent className="w-80 space-y-1 text-sm">
        <SourceSummary source={source} />
      </HoverCardContent>
    </HoverCard>
  )
}

function SourceSummary({ source }: { source: CitedSource }) {
  return (
    <>
      <p className="font-medium">{source.shortName}</p>
      <p className="text-xs text-muted-foreground">
        {source.table.title} ({tableNumber(source.table.productId)})
      </p>
      <p className="text-xs text-muted-foreground">
        Reference period {source.periodsUsed.join(', ')} · released{' '}
        {source.releasedOn.join(', ')}
      </p>
      <Flags flags={source.flags} />
    </>
  )
}

/** All of an answer's sources as one quiet line, expanding to a numbered list grouped by
 * table. Quality flags show on the collapsed line too, so they're never hidden (trust rule
 * 3). */
export function AnswerSources({ citations }: { citations: Citations }) {
  const { sources, groups, flaggedCount } = citations
  if (!sources.length) return null
  return (
    <details className="group text-sm text-muted-foreground">
      <summary className="flex w-fit cursor-pointer list-none items-center gap-1 hover:text-foreground">
        <ChevronRight
          className="size-4 transition-transform group-open:rotate-90"
          aria-hidden
        />
        {sources.length} {sources.length === 1 ? 'source' : 'sources'}
        {flaggedCount > 0 && (
          <span className="ml-1 inline-flex items-center gap-1 text-amber-700 dark:text-amber-400">
            <AlertTriangle className="size-3.5" aria-hidden />
            {flaggedCount} flagged
          </span>
        )}
      </summary>
      <div aria-label="Sources" role="region" className="mt-2 space-y-3 pl-5">
        {groups.map((group) => (
          <div key={group.table.productId} className="space-y-1">
            <a
              href={group.table.link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-foreground hover:underline"
            >
              {group.table.title}
              <span className="text-muted-foreground">
                ({tableNumber(group.table.productId)})
              </span>
              <ExternalLink className="size-3" aria-hidden />
            </a>
            {group.shared.length > 0 && (
              <p className="text-xs">All series: {group.shared.join(' · ')}</p>
            )}
            <ol className="space-y-0.5">
              {group.sources.map((source) => (
                <li
                  key={source.coordinate}
                  className="flex items-baseline gap-2"
                >
                  <span className="w-5 shrink-0 text-right tabular-nums">
                    {source.number}.
                  </span>
                  <span className="min-w-0">
                    <a
                      href={source.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-foreground hover:underline"
                    >
                      {source.shortName}
                    </a>
                    <span className="text-xs">
                      {source.vectorId !== null && ` · v${source.vectorId}`} ·{' '}
                      {source.periodsUsed.join(', ')}
                    </span>
                    <Flags flags={source.flags} />
                  </span>
                </li>
              ))}
            </ol>
            {group.footnotes.length > 0 && (
              <details>
                <summary className="cursor-pointer text-xs">
                  StatCan notes ({group.footnotes.length})
                </summary>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-xs">
                  {group.footnotes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        ))}
      </div>
    </details>
  )
}

function Flags({ flags }: { flags: string[] }) {
  if (!flags.length) return null
  return (
    <span className="mt-0.5 flex items-start gap-1 text-xs text-amber-700 dark:text-amber-400">
      <AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden />
      {flags.join('; ')}
    </span>
  )
}
