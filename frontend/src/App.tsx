import { ArrowUp, Square, SquarePen } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { ChatMessage } from '@/chat/chatState'
import { nextExamples } from '@/chat/examples'
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

// Picked once per page load at module level, not in a useState initializer, which React's
// StrictMode runs twice in development and would skip a set.
const firstExamples = nextExamples()

// One centred column, like Claude/ChatGPT: charts (#16) and exports (#17) live inside each
// answer, not in a side panel.
export default function App({ transport }: { transport?: ChatTransport }) {
  const { messages, isStreaming, send, stop, reset } = useChat(transport)
  const [input, setInput] = useState('')
  const [examples, setExamples] = useState(firstExamples)
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

  const newChat = () => {
    reset()
    setInput('')
    setExamples(nextExamples())
  }

  const prompt = (
    <div ref={inputAreaRef}>
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
      <header className="flex items-center justify-between px-4 py-3">
        <h1 className="font-semibold">StatCan Data Assistant</h1>
        <Button
          variant="ghost"
          size="sm"
          onClick={newChat}
          disabled={messages.length === 0}
        >
          <SquarePen aria-hidden />
          New chat
        </Button>
      </header>

      {messages.length === 0 ? (
        <main className="flex flex-1 flex-col items-center justify-center gap-6 px-4 pb-24">
          <div className="space-y-1 text-center">
            <h2 className="text-2xl font-semibold">
              What would you like to know?
            </h2>
            <p className="text-muted-foreground">
              Ask about Statistics Canada data in plain language. Every answer
              cites its source.
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
        <main className="flex min-h-0 flex-1 flex-col">
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
                    onRetry={() => submit(previousQuestion(messages, index))}
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
