import { Check, Loader2, RotateCcw } from 'lucide-react'
import type { Step } from '@/chat/chatState'

/** The agent's progress, so the user can see what it's doing while they wait. */
export function Steps({ steps, active }: { steps: Step[]; active: boolean }) {
  if (!steps.length) {
    return active ? (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        Thinking…
      </p>
    ) : null
  }
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
