import { Anchor } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ChatComposer } from './chat-composer';
import type { ChatMessageData } from './chat-message';
import { ChatMessage } from './chat-message';
import { StatusBar } from './composer/status-bar';

const SUGGESTION_CARDS = [
  {
    id: 'scaffold',
    text: 'Scaffold a new microservice with auth and tests.',
  },
  {
    id: 'review',
    text: 'Review the last PR and suggest improvements.',
  },
  {
    id: 'plan',
    text: 'Create a plan to migrate the database schema.',
  },
];

function HeroState({ onSuggestionClick }: { onSuggestionClick: (text: string) => void }) {
  return (
    <div className="flex flex-col items-center justify-center flex-1 px-4">
      <div className="flex flex-col items-center gap-4 mb-16">
        <div className="w-16 h-16 rounded-full border-2 border-zinc-700 flex items-center justify-center">
          <Anchor className="w-8 h-8 text-zinc-400" />
        </div>
        <h2 className="text-2xl font-semibold text-zinc-100">Let's build</h2>
        <p className="text-zinc-500 text-sm">New project</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full max-w-3xl">
        {SUGGESTION_CARDS.map((card) => (
          <button
            key={card.id}
            type="button"
            className="text-left p-4 rounded-xl border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800/70 transition-colors cursor-pointer"
            onClick={() => onSuggestionClick(card.text)}
          >
            <p className="text-sm text-zinc-300 leading-relaxed">{card.text}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

export function ChatPage() {
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
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

  const hasMessages = messages.length > 0;

  return (
    <div className="flex flex-col h-dvh bg-zinc-950">
      <header className="flex items-center justify-center px-4 py-3 border-b border-zinc-800/50">
        <h1 className="text-sm font-medium text-zinc-300">Shipyard</h1>
      </header>

      {hasMessages ? (
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
            {messages.map((msg) => (
              <ChatMessage key={msg.id} message={msg} />
            ))}
          </div>
        </div>
      ) : (
        <HeroState onSuggestionClick={handleSubmit} />
      )}

      <div className="shrink-0">
        <ChatComposer onSubmit={handleSubmit} />
        <StatusBar />
      </div>
    </div>
  );
}
