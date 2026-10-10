import { ArrowUp } from 'lucide-react'
import { useState } from 'react'
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

// Layout only - no backend connection yet. Streaming chat is #14/#15, charts #16, exports #17.
export default function App() {
  const [input, setInput] = useState('')

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
            <ChatContainerContent className="gap-4">
              <Message>
                <MessageContent className="bg-secondary">
                  Hi! Ask me something like "What's the unemployment rate in
                  Ontario?"
                </MessageContent>
              </Message>
            </ChatContainerContent>
          </ChatContainerRoot>

          <div className="border-t p-4">
            <PromptInput value={input} onValueChange={setInput} disabled>
              <PromptInputTextarea placeholder="Ask about Canadian statistics… (coming soon)" />
              <PromptInputActions className="justify-end pt-2">
                <PromptInputAction tooltip="Send">
                  <Button
                    size="icon"
                    className="rounded-full"
                    disabled
                    aria-label="Send"
                  >
                    <ArrowUp />
                  </Button>
                </PromptInputAction>
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
