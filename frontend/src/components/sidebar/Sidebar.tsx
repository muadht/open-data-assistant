import {
  Library,
  PanelLeftClose,
  PanelLeftOpen,
  SquarePen,
  type LucideIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface RecentChat {
  id: string
  title: string
}

interface Props {
  /** Icons only (#78): collapsed, the sidebar stays as a rail rather than disappearing. */
  collapsed: boolean
  recents: RecentChat[]
  currentId: string
  browsing: boolean
  /** While an answer streams, switching chats would cut it off. */
  busy: boolean
  canStartNew: boolean
  onNewChat: () => void
  onOpenChat: (id: string) => void
  onBrowse: () => void
  onToggle: () => void
  /** The profile avatar and its menu, at the bottom. */
  profile: ReactNode
}

/** The app's name and actions, then this page session's chats (#76). */
export function Sidebar({
  collapsed,
  recents,
  currentId,
  browsing,
  busy,
  canStartNew,
  onNewChat,
  onOpenChat,
  onBrowse,
  onToggle,
  profile,
}: Props) {
  const actions = (
    <>
      <SidebarItem
        icon={SquarePen}
        label="New chat"
        compact={collapsed}
        onClick={onNewChat}
        disabled={busy || !canStartNew}
      />
      <SidebarItem
        icon={Library}
        label="Browse tables"
        compact={collapsed}
        onClick={onBrowse}
        pressed={browsing}
      />
    </>
  )

  if (collapsed) {
    return (
      <nav
        aria-label="Sidebar"
        className="flex h-full w-14 flex-col items-center gap-1 bg-sidebar py-3 text-sidebar-foreground"
      >
        <button
          type="button"
          onClick={onToggle}
          aria-label="Open sidebar"
          title="Open sidebar"
          className="mb-3 rounded-md p-2 text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <PanelLeftOpen className="size-4" />
        </button>
        {actions}
        <div className="mt-auto">{profile}</div>
      </nav>
    )
  }

  return (
    <nav
      aria-label="Sidebar"
      className="flex h-full w-64 flex-col bg-sidebar text-sm text-sidebar-foreground"
    >
      <div className="flex items-center justify-between py-3 pr-2 pl-4">
        <span className="font-semibold">StatCan Data Assistant</span>
        <button
          type="button"
          onClick={onToggle}
          aria-label="Close sidebar"
          title="Close sidebar"
          className="rounded-md p-1.5 text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <PanelLeftClose className="size-4" />
        </button>
      </div>

      <div className="space-y-0.5 px-2">{actions}</div>

      <div className="mt-6 min-h-0 flex-1 overflow-y-auto px-2">
        <h2 className="px-2 pb-1 text-xs font-medium text-muted-foreground">
          Recents
        </h2>
        {recents.length > 0 ? (
          <ul className="space-y-0.5">
            {recents.map((chat) => (
              <li key={chat.id}>
                <button
                  type="button"
                  onClick={() => onOpenChat(chat.id)}
                  disabled={busy && chat.id !== currentId}
                  aria-current={chat.id === currentId ? 'page' : undefined}
                  title={chat.title}
                  className={cn(
                    'block w-full truncate rounded-md px-2 py-1.5 text-left hover:bg-sidebar-accent disabled:opacity-50 disabled:hover:bg-transparent',
                    chat.id === currentId &&
                      'bg-sidebar-accent font-medium text-sidebar-accent-foreground',
                  )}
                >
                  {chat.title}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-2 text-muted-foreground">
            Your chats will appear here.
          </p>
        )}
      </div>

      <div className="border-t p-2">{profile}</div>
    </nav>
  )
}

function SidebarItem({
  icon: Icon,
  label,
  compact,
  onClick,
  disabled,
  pressed,
}: {
  icon: LucideIcon
  label: string
  compact: boolean
  onClick: () => void
  disabled?: boolean
  pressed?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      aria-label={compact ? label : undefined}
      title={compact ? label : undefined}
      className={cn(
        'flex items-center gap-2.5 rounded-md hover:bg-sidebar-accent disabled:opacity-50 disabled:hover:bg-transparent',
        compact ? 'p-2' : 'w-full px-2 py-1.5',
        pressed && 'bg-sidebar-accent text-sidebar-accent-foreground',
      )}
    >
      <Icon className="size-4 text-muted-foreground" aria-hidden />
      {!compact && label}
    </button>
  )
}
