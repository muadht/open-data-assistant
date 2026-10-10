import {
  AlertTriangle,
  ArrowRight,
  Check,
  Copy,
  Download,
  Info,
  RotateCcw,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import type { Components } from 'react-markdown'
import type { AssistantMessage } from '@/chat/chatState'
import { citations, linkCitations } from '@/chat/citations'
import type { AnswerEvent } from '@/chat/events'
import { Button } from '@/components/ui/button'
import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
} from '@/components/ui/message'
import { AnswerChart } from './AnswerChart'
import { AnswerSources, CitationMarker } from './AnswerSources'
import { RelatedTables } from './RelatedTables'
import { Steps } from './Steps'

interface Props {
  message: AssistantMessage
  active: boolean
  onSend: (text: string) => void
  onRetry: () => void
}

export function AssistantReply({ message, active, onSend, onRetry }: Props) {
  const { outcome } = message
  return (
    <Message className="flex-col items-stretch gap-5">
      <Steps steps={message.steps} active={active} />

      {outcome?.kind === 'answer' && (
        <>
          <AnswerBody answer={outcome.answer} />
          <RelatedTables tables={outcome.answer.related_tables ?? []} />
        </>
      )}

      {outcome?.kind === 'clarification' && (
        // A question like any other reply, with the choices as a plain list of rows that
        // wrap long text - no coloured box.
        <div className="space-y-3">
          <p>{outcome.clarification.question}</p>
          <ul
            aria-label="Choose one"
            className="divide-y overflow-hidden rounded-lg border text-sm"
          >
            {outcome.clarification.options.map((option) => (
              <li key={option}>
                <button
                  type="button"
                  disabled={active}
                  onClick={() => onSend(option)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
                >
                  <span>{option}</span>
                  <ArrowRight
                    className="size-4 shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {outcome?.kind === 'unanswerable' && (
        <div className="space-y-1 rounded-lg border bg-muted p-3">
          <p className="flex items-start gap-2">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
            {outcome.unanswerable.reason}
          </p>
          {outcome.unanswerable.alternative && (
            <p className="pl-6 text-muted-foreground">
              {outcome.unanswerable.alternative}
            </p>
          )}
        </div>
      )}

      {outcome?.kind === 'error' && (
        <div
          role="alert"
          className="flex items-start justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3"
        >
          <p className="flex items-start gap-2">
            <AlertTriangle
              className="mt-0.5 size-4 shrink-0 text-destructive"
              aria-hidden
            />
            {outcome.error.message}
          </p>
          {outcome.error.retryable && (
            <Button
              variant="outline"
              size="sm"
              disabled={active}
              onClick={onRetry}
            >
              <RotateCcw aria-hidden />
              Try again
            </Button>
          )}
        </div>
      )}
    </Message>
  )
}

function AnswerActions({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <MessageActions className="text-muted-foreground">
      <MessageAction tooltip={copied ? 'Copied' : 'Copy answer'}>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={copy}
          aria-label="Copy answer"
        >
          {copied ? <Check /> : <Copy />}
        </Button>
      </MessageAction>
      {/* Enabled by #17: CSV / Excel / JSON of this answer's data. */}
      <MessageAction tooltip="Export the data (coming soon)">
        <span>
          <Button variant="ghost" size="sm" disabled aria-label="Export data">
            <Download />
            Export
          </Button>
        </span>
      </MessageAction>
    </MessageActions>
  )
}

/** The answer text with its citation markers as numbered links (#63), then the chart, the
 * sources and the actions. */
function AnswerBody({ answer }: { answer: AnswerEvent }) {
  const cited = useMemo(() => citations(answer), [answer])
  const components = useMemo<Partial<Components>>(
    () => ({
      a: ({ href, children, node: _node, ...props }) => {
        const number = href?.startsWith('#cite-') ? Number(href.slice(6)) : null
        const source = cited.sources.find((s) => s.number === number)
        if (source) return <CitationMarker source={source} />
        // Any other link opens without losing the conversation.
        return (
          <a {...props} href={href} target="_blank" rel="noopener noreferrer">
            {children}
          </a>
        )
      },
    }),
    [cited],
  )
  return (
    <>
      <MessageContent
        markdown
        components={components}
        className="max-w-none bg-transparent p-0"
      >
        {linkCitations(answer.text, cited.sourceOfValue)}
      </MessageContent>
      <AnswerChart results={answer.data_results} />
      <AnswerSources citations={cited} />
      <AnswerActions text={answer.text.replace(/\s*(\[\d+\])+/g, '')} />
    </>
  )
}
