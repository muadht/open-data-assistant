import {
  AlertTriangle,
  Check,
  Copy,
  Download,
  HelpCircle,
  Info,
  RotateCcw,
} from 'lucide-react'
import { useState } from 'react'
import type { Components } from 'react-markdown'
import type { AssistantMessage } from '@/chat/chatState'
import { Button } from '@/components/ui/button'
import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
} from '@/components/ui/message'
import { AnswerChart } from './AnswerChart'
import { AnswerSources } from './AnswerSources'
import { RelatedTables } from './RelatedTables'
import { Steps } from './Steps'

// Answer links point to StatCan pages; open them without losing the conversation.
const MARKDOWN_COMPONENTS: Partial<Components> = {
  a: ({ children, ...props }) => (
    <a {...props} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
}

interface Props {
  message: AssistantMessage
  active: boolean
  onSend: (text: string) => void
  onRetry: () => void
}

export function AssistantReply({ message, active, onSend, onRetry }: Props) {
  const { outcome } = message
  return (
    <Message className="flex-col items-stretch gap-3">
      <Steps steps={message.steps} active={active} />

      {outcome?.kind === 'answer' && (
        <>
          <MessageContent
            markdown
            components={MARKDOWN_COMPONENTS}
            className="max-w-none bg-transparent p-0"
          >
            {outcome.answer.text}
          </MessageContent>
          <AnswerChart results={outcome.answer.data_results} />
          <AnswerSources answer={outcome.answer} />
          <AnswerActions text={outcome.answer.text} />
          <RelatedTables tables={outcome.answer.related_tables ?? []} />
        </>
      )}

      {outcome?.kind === 'clarification' && (
        <div className="space-y-2 rounded-lg border border-sky-300 bg-sky-50 p-3 dark:border-sky-800 dark:bg-sky-950">
          <p className="flex items-start gap-2 font-medium">
            <HelpCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {outcome.clarification.question}
          </p>
          <div className="flex flex-wrap gap-2">
            {outcome.clarification.options.map((option) => (
              <Button
                key={option}
                variant="outline"
                size="sm"
                disabled={active}
                onClick={() => onSend(option)}
              >
                {option}
              </Button>
            ))}
          </div>
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
