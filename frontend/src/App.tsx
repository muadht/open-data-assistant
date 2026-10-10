import { ArrowUp, Square } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { ChatMessage } from '@/chat/chatState'
import type { ChatTransport } from '@/chat/transport'
import { useChat } from '@/chat/useChat'
import { AssistantReply } from '@/components/chat/AssistantReply'
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

const EXAMPLES = [
  "What's the unemployment rate in Ontario?",
  "How does Ontario's CPI compare with Alberta's?",
  "What's inflation?",
]

// Charts are #16, exports #17.
export default function App({ transport }: { transport?: ChatTransport }) {
  const { messages, isStreaming, send, stop } = useChat(transport)
  const [input, setInput] = useState('')
  const inputAreaRef = useRef<HTMLDivElement>(null)

  // Return focus to the input when a reply finishes, so the next question can be typed
  // straight away.
  useEffect(() => {
    if (!isStreaming) inputAreaRef.current?.querySelector('textarea')?.focus()
  }, [isStreaming])

  const submit = (text: string) => {
    if (!text.trim() || isStreaming) return
    send(text)
    setInput('')
  }

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <header className="border-b px-6 py-4">
        <h1 className="text-lg font-semibold">StatCan Data Assistant</h1>
        <p className="text-sm text-muted-foreground">
          Ask questions about Statistics Canada data in plain language.
        </p>
      </header>

      <main className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="flex min-h-0 flex-col border-r" aria-label="Chat">
          <ChatContainerRoot className="flex-1 px-6 py-4">
            <ChatContainerContent
              className="gap-6"
              role="log"
              aria-live="polite"
              aria-busy={isStreaming}
            >
              {messages.length === 0 ? (
                <EmptyState onPick={submit} />
              ) : (
                messages.map((message, index) =>
                  message.role === 'user' ? (
                    <Message key={message.id} className="justify-end">
                      <MessageContent className="max-w-[85%] bg-primary text-primary-foreground">
                        {message.text}
                      </MessageContent>
                    </Message>
                  ) : (
                    <AssistantReply
                      key={message.id}
                      message={message}
                      active={isStreaming && index === messages.length - 1}
                      onSend={submit}
                      onRetry={() => submit(previousQuestion(messages, index))}
                    />
                  ),
                )
              )}
            </ChatContainerContent>
          </ChatContainerRoot>

          <div ref={inputAreaRef} className="border-t p-4">
            <PromptInput
              value={input}
              onValueChange={setInput}
              isLoading={isStreaming}
              onSubmit={() => submit(input)}
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
        </section>

        <aside className="flex min-h-0 flex-col gap-4 p-6" aria-label="Data">
          <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
            Charts will appear here
          </div>
          <div className="flex items-center justify-between rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            <span>Export the data behind an answer</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled>
                CSV
              </Button>
              <Button variant="outline" size="sm" disabled>
                Excel
              </Button>
              <Button variant="outline" size="sm" disabled>
                JSON
              </Button>
            </div>
          </div>
        </aside>
      </main>
    </div>
  )
}

function EmptyState({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="space-y-3 py-8 text-center">
      <p className="text-muted-foreground">Try asking:</p>
      <div className="flex flex-col items-center gap-2">
        {EXAMPLES.map((example) => (
          <Button
            key={example}
            variant="outline"
            onClick={() => onPick(example)}
          >
            {example}
          </Button>
        ))}
      </div>
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
