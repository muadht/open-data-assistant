import { X } from 'lucide-react'

export function PanelClose({
  label,
  onClose,
}: {
  label: string
  onClose: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label={label}
      className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      <X className="size-4" />
    </button>
  )
}
