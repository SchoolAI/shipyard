import { ChevronDown } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppHotkeys } from '../hooks/use-app-hotkeys';
import type { ChatComposerHandle } from './chat-composer';
import { ChatComposer } from './chat-composer';
import type { ChatMessageData } from './chat-message';
import { ChatMessage } from './chat-message';
import { StatusBar } from './composer/status-bar';
import { DiffPanel } from './panels/diff-panel';
import type { TerminalPanelHandle } from './panels/terminal-panel';
import { TerminalPanel } from './panels/terminal-panel';
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
    <div className="flex flex-col items-center justify-center flex-1 w-full max-w-3xl mx-auto px-3 sm:px-4">
      <div className="flex flex-col items-center gap-4 mb-12 sm:mb-16">
        <img
          src="/icon.svg"
          alt="Shipyard"
          className="w-16 h-16 sm:w-20 sm:h-20 object-contain opacity-80"
        />
        <h2 className="text-xl sm:text-2xl font-semibold text-foreground">What are we building?</h2>
        <button
          type="button"
          aria-label="Select project"
          className="flex items-center gap-1 text-muted text-sm hover:text-foreground transition-colors cursor-pointer"
        >
          New project
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="w-full overflow-hidden">
        <div className="flex items-center justify-end mb-2">
          <button
            type="button"
            aria-label="Explore more suggestions"
            className="text-xs text-muted hover:text-foreground transition-colors cursor-pointer"
          >
            Explore more
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 overflow-hidden">
          {SUGGESTION_CARDS.map((card) => (
            <button
              key={card.id}
              type="button"
              aria-label={`Use suggestion: ${card.text}`}
              className="text-left p-3 sm:p-4 rounded-xl border border-separator bg-surface/50 hover:bg-default/70 transition-colors cursor-pointer overflow-hidden min-w-0"
              onClick={() => onSuggestionClick(card.text)}
            >
              <p className="text-sm text-foreground/80 leading-relaxed line-clamp-3">{card.text}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ChatPage() {
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);
  const [isDiffOpen, setIsDiffOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const demoTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const composerRef = useRef<ChatComposerHandle>(null);
  const terminalRef = useRef<TerminalPanelHandle>(null);
  const prevTerminalOpen = useRef(false);

  useEffect(() => {
    return () => clearTimeout(demoTimerRef.current);
  }, []);

  useEffect(() => {
    if (isTerminalOpen && !prevTerminalOpen.current) {
      requestAnimationFrame(() => {
        terminalRef.current?.focus();
      });
    } else if (!isTerminalOpen && prevTerminalOpen.current) {
      requestAnimationFrame(() => {
        composerRef.current?.focus();
      });
    }
    prevTerminalOpen.current = isTerminalOpen;
  }, [isTerminalOpen]);

  const toggleTerminal = useCallback(() => {
    setIsTerminalOpen((prev) => !prev);
  }, []);

  const toggleDiff = useCallback(() => {
    setIsDiffOpen((prev) => !prev);
  }, []);

  useAppHotkeys({
    onToggleTerminal: toggleTerminal,
    onToggleDiff: toggleDiff,
  });

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

    demoTimerRef.current = setTimeout(() => {
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

  const handleClearChat = useCallback(() => {
    setMessages([]);
  }, []);

  const hasMessages = messages.length > 0;

  return (
    <div className="flex h-dvh bg-background">
      {/* Main column: top bar + chat + terminal */}
      <div className="flex flex-col flex-1 min-w-0">
        <TopBar onToggleTerminal={toggleTerminal} onToggleDiff={toggleDiff} />

        {/* Chat area */}
        {hasMessages ? (
          <div ref={scrollRef} className="flex-1 overflow-y-auto">
            <div className="max-w-3xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-4 sm:space-y-6">
              {messages.map((msg) => (
                <ChatMessage key={msg.id} message={msg} />
              ))}
            </div>
          </div>
        ) : (
          <HeroState onSuggestionClick={handleSubmit} />
        )}

        {/* Composer */}
        <div className="shrink-0 w-full max-w-3xl mx-auto px-3 sm:px-4">
          <ChatComposer ref={composerRef} onSubmit={handleSubmit} onClearChat={handleClearChat} />
          <StatusBar />
        </div>

        {/* Terminal panel */}
        <TerminalPanel
          ref={terminalRef}
          isOpen={isTerminalOpen}
          onClose={() => setIsTerminalOpen(false)}
        />
      </div>

      {/* Diff side panel */}
      <DiffPanel isOpen={isDiffOpen} onClose={() => setIsDiffOpen(false)} />
    </div>
  );
}
