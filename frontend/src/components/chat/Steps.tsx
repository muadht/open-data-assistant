import { Check, ChevronRight, Loader2, RotateCcw } from 'lucide-react'
import type { Step } from '@/chat/chatState'

/** The agent's progress: a live list while it works, collapsed to one line once the reply
 * is done (like Claude's and ChatGPT's tool-use summaries). */
export function Steps({ steps, active }: { steps: Step[]; active: boolean }) {
  if (!steps.length) {
    return active ? (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        Thinking…
      </p>
    ) : null
  }
  if (active) return <StepList steps={steps} active />
  return (
    <details className="group text-sm text-muted-foreground">
      <summary className="flex cursor-pointer list-none items-center gap-1 hover:text-foreground">
        <ChevronRight
          className="size-4 transition-transform group-open:rotate-90"
          aria-hidden
        />
        Worked through {steps.length} {steps.length === 1 ? 'step' : 'steps'}
      </summary>
      <div className="mt-2 pl-5">
        <StepList steps={steps} active={false} />
      </div>
    </details>
  )
}

function StepList({ steps, active }: { steps: Step[]; active: boolean }) {
  return (
    <ol className="space-y-1 text-sm text-muted-foreground" aria-label="Steps">
      {steps.map((step) => (
        <li key={step.callId} className="flex items-center gap-2">
          {step.ok === undefined ? (
            active ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <span className="size-4" aria-hidden />
            )
          ) : step.ok ? (
            <Check className="size-4 text-green-600" aria-hidden />
          ) : (
            // A failed step means the agent corrected itself and retried - not an error.
            <RotateCcw className="size-4" aria-hidden />
          )}
          <span>
            {step.label}
            {step.ok === false && ' (retrying)'}
          </span>
        </li>
      ))}
    </ol>
  )
}
