import { Library, PanelLeftClose, SquarePen } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface RecentChat {
  id: string
  title: string
}

interface Props {
  recents: RecentChat[]
  currentId: string
  browsing: boolean
  /** While an answer streams, switching chats would cut it off. */
  busy: boolean
  canStartNew: boolean
  onNewChat: () => void
  onOpenChat: (id: string) => void
  onBrowse: () => void
  onClose: () => void
}

/** The app's name and actions, then this page session's chats (#76). */
export function Sidebar({
  recents,
  currentId,
  browsing,
  busy,
  canStartNew,
  onNewChat,
  onOpenChat,
  onBrowse,
  onClose,
}: Props) {
  return (
    <nav
      aria-label="Sidebar"
      className="flex h-full w-64 flex-col bg-sidebar text-sm text-sidebar-foreground"
    >
      <div className="flex items-center justify-between py-3 pr-2 pl-4">
        <span className="font-semibold">StatCan Data Assistant</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close sidebar"
          className="rounded-md p-1.5 text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <PanelLeftClose className="size-4" />
        </button>
      </div>

      <div className="space-y-0.5 px-2">
        <SidebarItem
          icon={<SquarePen className="size-4" />}
          onClick={onNewChat}
          disabled={busy || !canStartNew}
        >
          New chat
        </SidebarItem>
        <SidebarItem
          icon={<Library className="size-4" />}
          onClick={onBrowse}
          pressed={browsing}
        >
          Browse tables
        </SidebarItem>
      </div>

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

      <p className="border-t px-4 py-3 text-xs text-muted-foreground">
        Chats are kept until you reload the page.
      </p>
    </nav>
  )
}

function SidebarItem({
  icon,
  onClick,
  disabled,
  pressed,
  children,
}: {
  icon: ReactNode
  onClick: () => void
  disabled?: boolean
  pressed?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-sidebar-accent disabled:opacity-50 disabled:hover:bg-transparent [&_svg]:text-muted-foreground',
        pressed && 'bg-sidebar-accent text-sidebar-accent-foreground',
      )}
    >
      {icon}
      {children}
    </button>
  )
}
