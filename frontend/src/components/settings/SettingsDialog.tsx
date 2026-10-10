import {
  Database,
  Info,
  Monitor,
  Moon,
  Settings2,
  Sun,
  type LucideIcon,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { useSettings } from '@/settings/context'
import type { Theme } from '@/settings/settings'

export type SettingsSection = 'general' | 'data' | 'about'

interface Props {
  /** The section to show, or null when closed. */
  section: SettingsSection | null
  onSectionChange: (section: SettingsSection | null) => void
  recentCount: number
  onClearRecents: () => void
}

/** Preferences in sections, listed down the side (#78). A new section is an entry in
 * SECTIONS and a component; a new setting is a row in its section. */
export function SettingsDialog({
  section,
  onSectionChange,
  recentCount,
  onClearRecents,
}: Props) {
  const SECTIONS: {
    id: SettingsSection
    label: string
    icon: LucideIcon
    content: ReactNode
  }[] = [
    { id: 'general', label: 'General', icon: Settings2, content: <General /> },
    {
      id: 'data',
      label: 'Data',
      icon: Database,
      content: (
        <DataControls
          recentCount={recentCount}
          onClearRecents={onClearRecents}
        />
      ),
    },
    { id: 'about', label: 'Help & about', icon: Info, content: <About /> },
  ]
  const current = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0]

  return (
    <Dialog
      open={section !== null}
      onOpenChange={(open) => !open && onSectionChange(null)}
    >
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <div className="flex min-h-96 flex-col sm:flex-row">
          <div className="border-b p-3 sm:w-48 sm:border-r sm:border-b-0">
            <DialogTitle className="px-2 pt-1 pb-3">Settings</DialogTitle>
            <DialogDescription className="sr-only">
              Preferences for this browser.
            </DialogDescription>
            <nav
              aria-label="Settings sections"
              className="flex gap-1 overflow-x-auto sm:flex-col"
            >
              {SECTIONS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => onSectionChange(id)}
                  aria-current={id === current.id ? 'page' : undefined}
                  className={cn(
                    'flex shrink-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted',
                    id === current.id && 'bg-muted font-medium',
                  )}
                >
                  <Icon className="size-4 text-muted-foreground" aria-hidden />
                  {label}
                </button>
              ))}
            </nav>
          </div>
          <section
            aria-label={current.label}
            className="flex-1 space-y-1 p-6 text-sm"
          >
            <h3 className="pb-3 text-base font-medium">{current.label}</h3>
            {current.content}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** One setting: its name and explanation on the left, its control on the right. */
function SettingRow({
  label,
  description,
  children,
}: {
  label: string
  description?: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b py-3 last:border-b-0">
      <div className="min-w-0 space-y-0.5">
        <p>{label}</p>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      {children}
    </div>
  )
}

const THEMES: { value: Theme; label: string; icon: LucideIcon }[] = [
  { value: 'system', label: 'System', icon: Monitor },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
]

function General() {
  const { settings, update } = useSettings()
  return (
    <SettingRow label="Theme" description="System follows your device.">
      <div
        role="radiogroup"
        aria-label="Theme"
        className="inline-flex rounded-lg border p-0.5"
      >
        {THEMES.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={settings.theme === value}
            onClick={() => update({ theme: value })}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-muted-foreground hover:text-foreground',
              settings.theme === value &&
                'bg-muted font-medium text-foreground',
            )}
          >
            <Icon className="size-3.5" aria-hidden />
            {label}
          </button>
        ))}
      </div>
    </SettingRow>
  )
}

function DataControls({
  recentCount,
  onClearRecents,
}: {
  recentCount: number
  onClearRecents: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  return (
    <>
      <SettingRow
        label="Where chats are kept"
        description="In this browser tab only, until you reload the page. Nothing is saved to an account."
      >
        <span className="text-muted-foreground">This session</span>
      </SettingRow>
      <SettingRow
        label="Clear recent chats"
        description={`${recentCount} ${recentCount === 1 ? 'chat' : 'chats'}, including the current one.`}
      >
        {confirming ? (
          <span className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirming(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                onClearRecents()
                setConfirming(false)
              }}
            >
              Clear all
            </Button>
          </span>
        ) : (
          <Button
            variant="outline"
            size="sm"
            disabled={recentCount === 0}
            onClick={() => setConfirming(true)}
          >
            Clear
          </Button>
        )}
      </SettingRow>
    </>
  )
}

function About() {
  return (
    <div className="space-y-3 leading-relaxed">
      <p>
        Ask about Statistics Canada data in plain language. The assistant finds
        the right table, fetches the figures from StatCan's Web Data Service,
        and cites every number it gives.
      </p>
      <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
        <li>Name a place and a time to get a precise answer.</li>
        <li>Click a source's table name to see what else the table has.</li>
        <li>Use Browse tables to find a table yourself, then ask about it.</li>
      </ul>
      <p className="text-muted-foreground">
        Data:{' '}
        <a
          href="https://www.statcan.gc.ca/en/developers/wds"
          target="_blank"
          rel="noopener noreferrer"
          className="text-foreground underline underline-offset-2"
        >
          Statistics Canada Web Data Service
        </a>
        . Answers use Statistics Canada data only.
      </p>
      <div className="space-y-2 rounded-lg border p-3 text-xs text-muted-foreground">
        <p>
          <span className="font-medium text-foreground">Prototype.</span> This
          is not a Government of Canada or Statistics Canada service.
        </p>
        {/* The attribution the Statistics Canada Open Licence asks for. */}
        <p>
          Source: Statistics Canada. Reproduced and distributed on an "as is"
          basis with the permission of Statistics Canada, under the{' '}
          <a
            href="https://www.statcan.gc.ca/en/reference/licence"
            target="_blank"
            rel="noopener noreferrer"
            className="text-foreground underline underline-offset-2"
          >
            Statistics Canada Open Licence
          </a>
          . This does not constitute an endorsement by Statistics Canada of this
          product.
        </p>
      </div>
    </div>
  )
}
