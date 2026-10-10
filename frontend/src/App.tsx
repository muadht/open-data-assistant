import { ArrowUp, ListTree, Square, SquarePen, Table2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { ChatMessage } from '@/chat/chatState'
import { nextExamples } from '@/chat/examples'
import { tableNumber } from '@/chat/tables'
import type { ChatTransport } from '@/chat/transport'
import { browseParamsFrom, browseSearchParams } from '@/tables/api'
import { useHashRoute, type View } from '@/tables/useHashRoute'
import { cn } from '@/lib/utils'
import { useChat } from '@/chat/useChat'
import { AssistantReply } from '@/components/chat/AssistantReply'
import { BrowsePage } from '@/components/tables/BrowsePage'
import { TableDrawer } from '@/components/tables/TableDrawer'
import { TablePanel } from '@/components/tables/TablePanel'
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

// Picked once per page load at module level, not in a useState initializer, which React's
// StrictMode runs twice in development and would skip a set.
const firstExamples = nextExamples()

// One centred column, like Claude/ChatGPT: charts (#16) and exports (#17) live inside each
// answer. The only side panel is a table's details (#70), opened on demand.
export default function App({ transport }: { transport?: ChatTransport }) {
  const { messages, isStreaming, send, stop, reset } = useChat(transport)
  const [input, setInput] = useState('')
  const [examples, setExamples] = useState(firstExamples)
  const inputAreaRef = useRef<HTMLDivElement>(null)
  const { route, navigate } = useHashRoute()
  // The table whose details are open: in a drawer over the browse page, and in a panel
  // beside the chat (#70). Kept apart so one view's table doesn't open in the other.
  const [drawerTable, setDrawerTable] = useState<number | null>(null)
  const [panelTable, setPanelTable] = useState<number | null>(null)
  // "Ask about this table": sent with every message until removed (#56).
  const [pinned, setPinned] = useState<{
    productId: number
    title: string
  } | null>(null)

  // Return focus to the input when a reply finishes, so the next question can be typed
  // straight away.
  useEffect(() => {
    if (!isStreaming) inputAreaRef.current?.querySelector('textarea')?.focus()
  }, [isStreaming])

  const submit = (text: string) => {
    if (!text.trim() || isStreaming) return
    send(text, pinned?.productId)
    setInput('')
  }

  const newChat = () => {
    reset()
    setInput('')
    setPinned(null)
    setPanelTable(null)
    setExamples(nextExamples())
  }

  const prompt = (
    <div ref={inputAreaRef} className="space-y-2">
      {pinned && (
        <div className="flex w-fit max-w-full items-center gap-2 rounded-full border bg-muted/50 py-1 pr-1 pl-3 text-sm">
          <Table2
            className="size-4 shrink-0 text-muted-foreground"
            aria-hidden
          />
          <span className="truncate">
            Asking about: {pinned.title}{' '}
            <span className="text-muted-foreground">
              ({tableNumber(pinned.productId)})
            </span>
          </span>
          <button
            type="button"
            onClick={() => setPanelTable(pinned.productId)}
            aria-label="View structure of this table"
            title="View structure"
            className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ListTree className="size-3.5" />
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
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <header className="flex items-center justify-between gap-4 px-4 py-3">
        <h1 className="font-semibold">StatCan Data Assistant</h1>
        <nav
          aria-label="Views"
          className="flex rounded-full border p-0.5 text-sm"
        >
          {(
            [
              ['chat', 'Chat'],
              ['browse', 'Browse tables'],
            ] as [View, string][]
          ).map(([view, label]) => (
            <button
              key={view}
              type="button"
              aria-current={route.view === view ? 'page' : undefined}
              onClick={() => navigate(view)}
              className={cn(
                'rounded-full px-3 py-1 text-muted-foreground hover:text-foreground',
                route.view === view && 'bg-muted font-medium text-foreground',
              )}
            >
              {label}
            </button>
          ))}
        </nav>
        <Button
          variant="ghost"
          size="sm"
          onClick={newChat}
          disabled={messages.length === 0 && !pinned}
          className={cn(route.view !== 'chat' && 'invisible')}
        >
          <SquarePen aria-hidden />
          New chat
        </Button>
      </header>

      {route.view === 'browse' ? (
        <main className="min-h-0 flex-1 overflow-y-auto">
          <BrowsePage
            params={browseParamsFrom(route.search)}
            onParamsChange={(params) =>
              navigate('browse', browseSearchParams(params))
            }
            onOpenTable={setDrawerTable}
          />
        </main>
      ) : (
        <div className="flex min-h-0 flex-1">
          {messages.length === 0 ? (
            <main className="flex min-w-0 flex-1 flex-col items-center justify-center gap-6 px-4 pb-24">
              <div className="space-y-1 text-center">
                <h2 className="text-2xl font-semibold">
                  What would you like to know?
                </h2>
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
                        onOpenTable={setPanelTable}
                      />
                    ),
                  )}
                </ChatContainerContent>
              </ChatContainerRoot>
              <div className="mx-auto w-full max-w-3xl px-4 pb-4">
                {prompt}
                <p className="mt-2 text-center text-xs text-muted-foreground">
                  Answers use Statistics Canada data only. Check the sources for
                  each answer.
                </p>
              </div>
            </main>
          )}
          <TablePanel
            productId={panelTable}
            onClose={() => setPanelTable(null)}
            onAsk={setPinned}
          />
        </div>
      )}

      <TableDrawer
        productId={drawerTable}
        onClose={() => setDrawerTable(null)}
        onAsk={(table) => {
          setPinned(table)
          setDrawerTable(null)
          navigate('chat')
        }}
      />
    </div>
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
