import { useCallback, useEffect, useRef, useState } from 'react';
import { ChatComposer } from './chat-composer';
import type { ChatMessageData } from './chat-message';
import { ChatMessage } from './chat-message';

const EXAMPLE_MESSAGES: ChatMessageData[] = [
  {
    id: '1',
    role: 'user',
    content: 'Can you help me set up a new workspace for the auth service?',
  },
  {
    id: '2',
    role: 'agent',
    content:
      "I'll create a new workspace for the auth service. Let me set up the project structure with the standard Shipyard configuration.\n\nI've created the workspace with:\n- TypeScript strict mode\n- Hono HTTP framework\n- Zod for validation\n- Vitest for testing\n\nThe workspace is ready at `services/auth`. Would you like me to scaffold the initial routes?",
  },
  {
    id: '3',
    role: 'user',
    content: 'Yes, add a login route with GitHub OAuth.',
  },
  {
    id: '4',
    role: 'agent',
    isThinking: true,
    content: '',
  },
];

export function ChatPage() {
  const [messages, setMessages] = useState<ChatMessageData[]>(EXAMPLE_MESSAGES);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const handleSubmit = useCallback((content: string) => {
    const userMessage: ChatMessageData = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
    };

    const thinkingMessage: ChatMessageData = {
      id: crypto.randomUUID(),
      role: 'agent',
      content: '',
      isThinking: true,
    };

    setMessages((prev) => [...prev, userMessage, thinkingMessage]);

    setTimeout(() => {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === thinkingMessage.id
            ? {
                ...msg,
                isThinking: false,
                content:
                  "I received your message. This is a static demo, so I can't actually process requests yet. Once connected to the agent backend, I'll be able to help with real tasks.",
              }
            : msg
        )
      );
    }, 2000);
  }, []);

  return (
    <div className="flex flex-col h-dvh bg-zinc-950">
      <header className="flex items-center justify-center px-4 py-3 border-b border-zinc-800/50">
        <h1 className="text-sm font-medium text-zinc-300">Shipyard</h1>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
          {messages.map((msg) => (
            <ChatMessage key={msg.id} message={msg} />
          ))}
        </div>
      </div>

      <div className="shrink-0">
        <ChatComposer onSubmit={handleSubmit} />
      </div>
    </div>
  );
}
