import { AlertTriangle, ExternalLink } from 'lucide-react'
import {
  formatPeriods,
  type CitedSource,
  type Citations,
} from '@/chat/citations'
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
          aria-label={`Source ${source.number}: ${source.shortName}, ${formatPeriods(source.periodsUsed)}${source.flags.length ? `, flagged: ${source.flags.join('; ')}` : ''}`}
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
        Reference period {formatPeriods(source.periodsUsed)} · released{' '}
        {source.releasedOn.join(', ')}
      </p>
      <Flags flags={source.flags} />
    </>
  )
}

/** All of an answer's sources, always visible: a numbered list grouped by table, with the
 * shared members and StatCan's notes once per table. A flag count in the heading makes
 * flagged sources stand out (trust rule 3). */
export function AnswerSources({ citations }: { citations: Citations }) {
  const { sources, groups, flaggedCount } = citations
  if (!sources.length) return null
  return (
    <section
      aria-label="Sources"
      className="space-y-3 pt-1 text-sm text-muted-foreground"
    >
      <h3 className="flex items-center gap-2 text-xs font-medium tracking-wide uppercase">
        Sources
        {flaggedCount > 0 && (
          <span className="inline-flex items-center gap-1 font-normal tracking-normal text-amber-700 normal-case dark:text-amber-400">
            <AlertTriangle className="size-3.5" aria-hidden />
            {flaggedCount} flagged
          </span>
        )}
      </h3>
      <div className="space-y-5">
        {groups.map((group) => (
          <div key={group.table.productId} className="space-y-2">
            <a
              href={group.table.link}
              target="_blank"
              rel="noopener noreferrer"
              // Inline text, not flex: a long title wraps like a sentence, and the table
              // number stays together with the icon instead of breaking onto two lines.
              className="leading-snug font-medium text-foreground hover:underline"
            >
              {group.table.title}{' '}
              <span className="whitespace-nowrap text-muted-foreground">
                ({tableNumber(group.table.productId)})
                <ExternalLink
                  className="ml-1 inline size-3 align-baseline"
                  aria-hidden
                />
              </span>
            </a>
            {group.shared.length > 0 && (
              <p className="text-xs">All series: {group.shared.join(' · ')}</p>
            )}
            <ol className="space-y-1.5 pt-1">
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
                      {formatPeriods(source.periodsUsed)}
                    </span>
                    <Flags flags={source.flags} />
                  </span>
                </li>
              ))}
            </ol>
            {group.footnotes.length > 0 && (
              <details>
                <summary className="cursor-pointer pt-1 text-xs hover:text-foreground">
                  StatCan notes ({group.footnotes.length})
                </summary>
                <ul className="mt-2 list-disc space-y-2 pl-5 text-xs leading-relaxed">
                  {group.footnotes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        ))}
      </div>
    </section>
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
