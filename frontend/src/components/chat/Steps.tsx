import { ChevronRight } from 'lucide-react'
import type { Step } from '@/chat/chatState'
import { cn } from '@/lib/utils'

// The agent's progress as a quiet timeline (the pattern of e.g. AI Elements' Chain of
// Thought): small dots on a thin line, each step's label with one line of what it found
// beneath, and a shimmer on whatever is still running. Steps fade in as they start; all
// motion stops for people who ask for reduced motion.

const ENTER =
  'animate-in fade-in slide-in-from-bottom-1 duration-300 motion-reduce:animate-none'

/** A live timeline while the agent works, collapsed to one line once the reply is done
 * (like Claude's and ChatGPT's tool-use summaries). */
export function Steps({ steps, active }: { steps: Step[]; active: boolean }) {
  if (!steps.length) {
    return active ? (
      <p className={cn('shimmer-text text-sm', ENTER)}>Thinking…</p>
    ) : null
  }
  if (active) return <Timeline steps={steps} active />
  return (
    <details className="group text-sm text-muted-foreground">
      <summary className="flex cursor-pointer list-none items-center gap-1 hover:text-foreground">
        <ChevronRight
          className="size-4 transition-transform group-open:rotate-90"
          aria-hidden
        />
        Worked through {steps.length} {steps.length === 1 ? 'step' : 'steps'}
      </summary>
      <div className="mt-3 pl-1.5">
        <Timeline steps={steps} active={false} />
      </div>
    </details>
  )
}

function Timeline({ steps, active }: { steps: Step[]; active: boolean }) {
  // Between steps the agent is thinking - and after fetching data, writing the answer, the
  // longest wait. A running last row says so, instead of a list that looks finished.
  const waiting = active && steps.every((s) => s.ok !== undefined)
  const writing = steps.some((s) => s.tool === 'get_data' && s.ok)
  return (
    <ol
      aria-label="Steps"
      className="ml-[3px] space-y-3 border-l border-border pl-4 text-sm text-muted-foreground"
    >
      {steps.map((step) => {
        const running = active && step.ok === undefined
        return (
          <li key={step.callId} className={cn('relative', ENTER)}>
            <Dot
              state={
                running ? 'running' : step.ok === false ? 'retried' : 'done'
              }
            />
            <span
              className={cn('block truncate', running && 'shimmer-text')}
              title={step.label}
            >
              {step.label}
              {step.ok === false && ' (retrying)'}
            </span>
            {step.detail && (
              <span
                className="mt-0.5 block animate-in truncate text-xs text-muted-foreground/75 duration-500 fade-in motion-reduce:animate-none"
                title={step.detail}
              >
                {step.detail}
              </span>
            )}
          </li>
        )
      })}
      {waiting && (
        <li className={cn('relative', ENTER)}>
          <Dot state="running" />
          <span className="shimmer-text block">
            {writing ? 'Writing the answer…' : 'Thinking…'}
          </span>
        </li>
      )}
    </ol>
  )
}

/** The step's marker on the line: filled when done, pulsing while running, hollow when the
 * agent corrected itself and tried again (progress, not an error). */
function Dot({ state }: { state: 'done' | 'running' | 'retried' }) {
  return (
    <span
      aria-hidden
      className={cn(
        'absolute top-[7px] -left-[20.5px] size-[7px] rounded-full ring-4 ring-background',
        state === 'done' && 'bg-muted-foreground/60',
        state === 'running' &&
          'animate-pulse bg-foreground motion-reduce:animate-none',
        state === 'retried' && 'border border-muted-foreground bg-background',
      )}
    />
  )
}
