import { ChevronDown } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppHotkeys } from '../hooks/use-app-hotkeys';
import { ChatComposer } from './chat-composer';
import type { ChatMessageData } from './chat-message';
import { ChatMessage } from './chat-message';
import { StatusBar } from './composer/status-bar';
import { TopBar } from './top-bar';

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
    <div className="flex flex-col items-center justify-center flex-1 w-full max-w-3xl mx-auto px-4">
      <div className="flex flex-col items-center gap-4 mb-16">
        <img src="/icon.svg" alt="Shipyard" className="w-20 h-20 object-contain opacity-80" />
        <h2 className="text-2xl font-semibold text-zinc-100">Let's build</h2>
        <button
          type="button"
          className="flex items-center gap-1 text-zinc-500 text-sm hover:text-zinc-300 transition-colors cursor-pointer"
        >
          New project
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="w-full overflow-hidden">
        <div className="flex items-center justify-end mb-2">
          <button
            type="button"
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
          >
            Explore more
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 overflow-hidden">
          {SUGGESTION_CARDS.map((card) => (
            <button
              key={card.id}
              type="button"
              className="text-left p-4 rounded-xl border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800/70 transition-colors cursor-pointer overflow-hidden min-w-0"
              onClick={() => onSuggestionClick(card.text)}
            >
              <p className="text-sm text-zinc-300 leading-relaxed line-clamp-3">{card.text}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ChatPage() {
  useAppHotkeys();
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
      <TopBar />

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

      <div className="shrink-0 w-full max-w-3xl mx-auto px-4">
        <ChatComposer onSubmit={handleSubmit} />
        <StatusBar />
      </div>
    </div>
  );
}
