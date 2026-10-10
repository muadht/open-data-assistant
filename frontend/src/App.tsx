import {
  ArrowUp,
  PanelLeftOpen,
  Square,
  SquarePen,
  Table2,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChatMessage, ChatState } from '@/chat/chatState'
import { nextExamples } from '@/chat/examples'
import { tableNumber } from '@/chat/tables'
import type { ChatTransport } from '@/chat/transport'
import { browseParamsFrom, browseSearchParams } from '@/tables/api'
import { useHashRoute } from '@/tables/useHashRoute'
import { SettingsProvider } from '@/settings/SettingsProvider'
import { ROOM_FOR_BOTH, WIDE } from '@/lib/breakpoints'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { cn } from '@/lib/utils'
import { useChat } from '@/chat/useChat'
import { MapleLeaf, PRODUCT_NAME } from '@/components/brand/Brand'
import { AssistantReply } from '@/components/chat/AssistantReply'
import {
  SettingsDialog,
  type SettingsSection,
} from '@/components/settings/SettingsDialog'
import { ProfileMenu } from '@/components/sidebar/ProfileMenu'
import { Sidebar } from '@/components/sidebar/Sidebar'
import { BrowsePane } from '@/components/tables/BrowsePane'
import { SidePanel } from '@/components/tables/SidePanel'
import { TableDetailsPane } from '@/components/tables/TableDetails'
import { Button } from '@/components/ui/button'
import {
  ChatContainerContent,
  ChatContainerRoot,
} from '@/components/ui/chat-container'
import { Message, MessageContent } from '@/components/ui/message'
import {
  PromptInput,
  PromptInputAction,
  PromptInputActions,
  PromptInputTextarea,
} from '@/components/ui/prompt-input'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'

// Picked once per page load at module level, not in a useState initializer, which React's
// StrictMode runs twice in development and would skip a set.
const firstExamples = nextExamples()

// A chat earlier in this page session, kept for Recents (#76).
interface SavedChat {
  id: string
  title: string
  state: ChatState
}

// One centred column, like Claude/ChatGPT: charts (#16) and exports (#17) live inside each
// answer. On its left, a sidebar with the app's actions and recent chats (#76); on its
// right, on demand, one panel for finding tables and seeing a table's details (#70, #74),
// so looking something up never hides the conversation.
export default function App({ transport }: { transport?: ChatTransport }) {
  const { sessionId, messages, isStreaming, send, stop, reset, restore } =
    useChat(transport)
  const [input, setInput] = useState('')
  const [examples, setExamples] = useState(firstExamples)
  const inputAreaRef = useRef<HTMLDivElement>(null)
  const { route, navigate } = useHashRoute()
  // The panel shows browsing while the URL is #/browse?..., and a table's details over it
  // (with a way back) or on their own.
  const browsing = route.view === 'browse'
  const [detailTable, setDetailTable] = useState<number | null>(null)
  // "Back to results" only for a table opened from the list: one opened from the chat (a
  // source or the pinned table) didn't come from there, even if the list is open beneath.
  const [detailFromList, setDetailFromList] = useState(false)
  const openTable = (productId: number, fromList = false) => {
    setDetailTable(productId)
    setDetailFromList(fromList)
  }
  // Closing the browse panel leaves #/browse, so its filters are kept here for reopening.
  const [lastBrowse, setLastBrowse] = useState(() =>
    browsing ? route.search : new URLSearchParams(),
  )
  // "Ask about this table": sent with every message until removed (#56).
  const [pinned, setPinned] = useState<{
    productId: number
    title: string
  } | null>(null)

  const wide = useMediaQuery(WIDE)
  const roomForBoth = useMediaQuery(ROOM_FOR_BOTH)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const panelOpen = browsing || detailTable !== null
  // Below ROOM_FOR_BOTH there's room for one side at a time: the table panel, while open,
  // collapses the sidebar to its icon rail (as ChatGPT's canvas does), and it expands
  // again when the panel closes.
  const sidebarExpanded = wide && sidebarOpen && (roomForBoth || !panelOpen)
  const [settingsSection, setSettingsSection] =
    useState<SettingsSection | null>(null)

  const [saved, setSaved] = useState<SavedChat[]>([])
  const [chatId, setChatId] = useState<string>(() => crypto.randomUUID())
  const title = messages.find((m) => m.role === 'user')?.text ?? ''
  const recents = [
    ...(messages.length > 0 && !saved.some((c) => c.id === chatId)
      ? [{ id: chatId, title }]
      : []),
    ...saved.map((c) => (c.id === chatId ? { id: c.id, title } : c)),
  ]
  // The current chat as Recents keeps it, updated in place if it's there already.
  const withCurrent = (): SavedChat[] => {
    if (messages.length === 0) return saved
    const entry = {
      id: chatId,
      title,
      state: { sessionId, messages, isStreaming: false },
    }
    return saved.some((c) => c.id === chatId)
      ? saved.map((c) => (c.id === chatId ? entry : c))
      : [entry, ...saved]
  }

  // Return focus to the input when a reply finishes, so the next question can be typed
  // straight away.
  useEffect(() => {
    if (!isStreaming) inputAreaRef.current?.querySelector('textarea')?.focus()
  }, [isStreaming])

  const closePanel = useCallback(() => {
    setDetailTable(null)
    if (browsing) navigate('chat')
  }, [browsing, navigate])

  const toggleBrowse = () => {
    if (browsing && detailTable === null) {
      navigate('chat')
    } else {
      setDetailTable(null)
      navigate('browse', lastBrowse)
    }
  }

  const submit = (text: string) => {
    if (!text.trim() || isStreaming) return
    send(text, pinned?.productId)
    setInput('')
  }

  const newChat = () => {
    setSaved(withCurrent())
    reset()
    setChatId(crypto.randomUUID())
    setInput('')
    setPinned(null)
    setDetailTable(null)
    setExamples(nextExamples())
    setMobileSidebarOpen(false)
  }

  const openChat = (id: string) => {
    setMobileSidebarOpen(false)
    if (id === chatId) return
    const next = withCurrent()
    const target = next.find((c) => c.id === id)
    if (!target) return
    setSaved(next)
    restore(target.state)
    setChatId(id)
    setInput('')
    setPinned(null)
    setDetailTable(null)
  }

  const openSidebar = () => {
    if (!wide) {
      setMobileSidebarOpen(true)
      return
    }
    setSidebarOpen(true)
    if (!roomForBoth) closePanel()
  }

  const clearRecents = () => {
    setSaved([])
    reset()
    setChatId(crypto.randomUUID())
    setInput('')
    setPinned(null)
    setDetailTable(null)
  }

  const renderSidebar = (collapsed: boolean) => (
    <Sidebar
      collapsed={collapsed}
      recents={recents}
      currentId={chatId}
      browsing={browsing && detailTable === null}
      busy={isStreaming}
      canStartNew={messages.length > 0 || pinned !== null}
      onNewChat={newChat}
      onOpenChat={openChat}
      onBrowse={() => {
        setMobileSidebarOpen(false)
        toggleBrowse()
      }}
      onToggle={() => {
        if (!wide) setMobileSidebarOpen(false)
        else if (sidebarExpanded) setSidebarOpen(false)
        else openSidebar()
      }}
      profile={
        <ProfileMenu
          compact={collapsed}
          onOpenSettings={(section) => {
            setMobileSidebarOpen(false)
            setSettingsSection(section)
          }}
        />
      }
    />
  )

  const prompt = (
    <div ref={inputAreaRef} className="space-y-2">
      {pinned && (
        <div className="flex w-fit max-w-full items-center gap-2 rounded-full border bg-muted/50 py-1 pr-1 pl-3 text-sm">
          <Table2
            className="size-4 shrink-0 text-muted-foreground"
            aria-hidden
          />
          <button
            type="button"
            onClick={() => openTable(pinned.productId)}
            title="View table details"
            className="truncate hover:underline"
          >
            Asking about: {pinned.title}{' '}
            <span className="text-muted-foreground">
              ({tableNumber(pinned.productId)})
            </span>
          </button>
          <button
            type="button"
            onClick={() => setPinned(null)}
            aria-label="Stop asking about this table"
            className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}
      <PromptInput
        value={input}
        onValueChange={setInput}
        isLoading={isStreaming}
        onSubmit={() => submit(input)}
        className="rounded-3xl"
      >
        <PromptInputTextarea
          placeholder="Ask about Canadian statistics…"
          aria-label="Your question"
        />
        <PromptInputActions className="justify-end pt-2">
          {isStreaming ? (
            <PromptInputAction tooltip="Stop">
              <Button
                size="icon"
                className="rounded-full"
                onClick={stop}
                aria-label="Stop"
              >
                <Square className="fill-current" />
              </Button>
            </PromptInputAction>
          ) : (
            <PromptInputAction tooltip="Send">
              <Button
                size="icon"
                className="rounded-full"
                disabled={!input.trim()}
                onClick={() => submit(input)}
                aria-label="Send"
              >
                <ArrowUp />
              </Button>
            </PromptInputAction>
          )}
        </PromptInputActions>
      </PromptInput>
    </div>
  )

  return (
    <SettingsProvider>
      <div className="flex h-dvh bg-background text-foreground">
        {wide ? (
          // Slides like the table panel: the width animates, so the chat moves with it.
          <div
            className={cn(
              'shrink-0 overflow-hidden border-r transition-[width] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none',
              sidebarExpanded ? 'w-64' : 'w-14',
            )}
          >
            {renderSidebar(!sidebarExpanded)}
          </div>
        ) : (
          <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
            <SheetContent
              side="left"
              showCloseButton={false}
              aria-describedby={undefined}
              className="w-64 gap-0 p-0"
            >
              <SheetTitle className="sr-only">Sidebar</SheetTitle>
              {renderSidebar(false)}
            </SheetContent>
          </Sheet>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-12 shrink-0 items-center gap-2 px-3">
            {!wide && (
              <button
                type="button"
                onClick={openSidebar}
                aria-label="Open sidebar"
                className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <PanelLeftOpen className="size-4" />
              </button>
            )}
            {/* The sidebar shows the name when it's expanded. */}
            <h1 className={cn('font-bold', sidebarExpanded && 'sr-only')}>
              {PRODUCT_NAME}
            </h1>
            <div className="ml-auto flex items-center gap-1">
              {/* Where Canada.ca puts its language toggle. A placeholder until the app is
                  translated: GC public tools must be in both official languages. */}
              <button
                type="button"
                lang="fr"
                aria-disabled
                title="Version française à venir · French version coming soon"
                className="cursor-not-allowed rounded-md px-2 py-1 text-sm text-muted-foreground underline-offset-4 hover:underline"
              >
                Français
              </button>
              {!wide && (
                <button
                  type="button"
                  onClick={newChat}
                  disabled={isStreaming || (messages.length === 0 && !pinned)}
                  aria-label="New chat"
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                >
                  <SquarePen className="size-4" />
                </button>
              )}
            </div>
          </header>

          <div className="flex min-h-0 flex-1">
            {messages.length === 0 ? (
              <main className="flex min-w-0 flex-1 flex-col items-center justify-center gap-6 px-4 pb-24">
                <div className="space-y-1 text-center">
                  <MapleLeaf className="mx-auto mb-3 size-9 text-gc-accent" />
                  <h2 className="text-2xl font-bold">
                    What would you like to know?
                  </h2>
                  {/* Canada.ca's red bar under a page's main heading. */}
                  <div
                    aria-hidden
                    className="mx-auto mt-2 mb-3 h-1.5 w-16 bg-gc-accent"
                  />
                  <p className="text-muted-foreground">
                    Ask about Statistics Canada data in plain language. Every
                    answer cites its source.
                  </p>
                </div>
                <div className="w-full max-w-3xl">{prompt}</div>
                <div className="flex max-w-3xl flex-wrap justify-center gap-2">
                  {examples.map((example) => (
                    <Button
                      key={example}
                      variant="outline"
                      size="sm"
                      className="rounded-full"
                      onClick={() => submit(example)}
                    >
                      {example}
                    </Button>
                  ))}
                </div>
              </main>
            ) : (
              <main className="flex min-h-0 min-w-0 flex-1 flex-col">
                <ChatContainerRoot className="flex-1">
                  <ChatContainerContent
                    className="mx-auto w-full max-w-3xl gap-8 px-4 py-6"
                    role="log"
                    aria-live="polite"
                    aria-busy={isStreaming}
                  >
                    {messages.map((message, index) =>
                      message.role === 'user' ? (
                        <Message key={message.id} className="justify-end">
                          <MessageContent className="max-w-[85%] rounded-3xl bg-muted px-4 py-2">
                            {message.text}
                          </MessageContent>
                        </Message>
                      ) : (
                        <AssistantReply
                          key={message.id}
                          message={message}
                          active={isStreaming && index === messages.length - 1}
                          onSend={submit}
                          onRetry={() =>
                            submit(previousQuestion(messages, index))
                          }
                          onOpenTable={openTable}
                        />
                      ),
                    )}
                  </ChatContainerContent>
                </ChatContainerRoot>
                <div className="mx-auto w-full max-w-3xl px-4 pb-4">
                  {prompt}
                  <p className="mt-2 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                    <MapleLeaf className="size-3.5 text-gc-accent" />
                    Answers use Statistics Canada data only. Check the sources
                    for each answer.
                  </p>
                </div>
              </main>
            )}
            <SidePanel
              open={browsing || detailTable !== null}
              label={detailTable !== null ? 'Table details' : 'Browse tables'}
              onClose={closePanel}
              focusKey={detailTable ?? 'browse'}
            >
              {browsing && (
                // Kept mounted under a table's details, so "Back to results" returns to the
                // same results and scroll position.
                <div
                  hidden={detailTable !== null}
                  className="flex min-h-0 flex-1 flex-col"
                >
                  <BrowsePane
                    params={browseParamsFrom(route.search)}
                    onParamsChange={(params) => {
                      const search = browseSearchParams(params)
                      setLastBrowse(search)
                      navigate('browse', search)
                    }}
                    onOpenTable={(productId) => openTable(productId, true)}
                    onClose={closePanel}
                  />
                </div>
              )}
              {detailTable !== null && (
                <TableDetailsPane
                  productId={detailTable}
                  onBack={
                    browsing && detailFromList
                      ? () => setDetailTable(null)
                      : undefined
                  }
                  onClose={closePanel}
                  onAsk={setPinned}
                />
              )}
            </SidePanel>
          </div>
        </div>
      </div>
      <SettingsDialog
        section={settingsSection}
        onSectionChange={setSettingsSection}
        recentCount={recents.length}
        onClearRecents={clearRecents}
      />
    </SettingsProvider>
  )
}

/** The user question an assistant reply was answering, for "Try again". */
function previousQuestion(messages: ChatMessage[], index: number): string {
  for (let i = index - 1; i >= 0; i--) {
    const message = messages[i]
    if (message.role === 'user') return message.text
  }
  return ''
}
