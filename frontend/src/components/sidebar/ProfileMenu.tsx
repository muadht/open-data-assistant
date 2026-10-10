import { CircleHelp, Settings, User } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import type { SettingsSection } from '@/components/settings/SettingsDialog'

/** The avatar at the bottom of the sidebar and its menu (#78). There are no accounts yet,
 * so it's a guest: when sign-in exists, the profile and account items go here. */
export function ProfileMenu({
  compact,
  onOpenSettings,
}: {
  /** Just the avatar, for the collapsed sidebar. */
  compact: boolean
  onOpenSettings: (section: SettingsSection) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Profile menu"
        className={cn(
          'flex w-full items-center gap-2.5 rounded-md p-1.5 text-left hover:bg-sidebar-accent',
          compact && 'w-auto',
        )}
      >
        <GuestAvatar />
        {!compact && (
          <span className="min-w-0">
            <span className="block truncate font-medium">Guest</span>
            <span className="block truncate text-xs text-muted-foreground">
              Not signed in
            </span>
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-60">
        <DropdownMenuLabel className="flex items-center gap-2.5 font-normal">
          <GuestAvatar />
          <span>
            <span className="block font-medium text-foreground">Guest</span>
            <span className="block text-xs">Chats last until you reload</span>
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onOpenSettings('general')}>
          <Settings aria-hidden />
          Settings
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onOpenSettings('about')}>
          <CircleHelp aria-hidden />
          Help
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function GuestAvatar() {
  return (
    <span
      aria-hidden
      className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
    >
      <User className="size-4" />
    </span>
  )
}
