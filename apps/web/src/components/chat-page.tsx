import type { PermissionMode } from '@shipyard/session';
import { ChevronDown } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAppHotkeys } from '../hooks/use-app-hotkeys';
import { useMachineSelection } from '../hooks/use-machine-selection';
import { usePersonalRoom } from '../hooks/use-personal-room';
import { useMessageStore, useTaskStore, useUIStore } from '../stores';
import type { ChatComposerHandle } from './chat-composer';
import { ChatComposer } from './chat-composer';
import type { ChatMessageData } from './chat-message';
import { ChatMessage } from './chat-message';
import { StatusBar } from './composer/status-bar';
import { DiffPanel } from './panels/diff-panel';
import type { TerminalPanelHandle } from './panels/terminal-panel';
import { TerminalPanel } from './panels/terminal-panel';
import { Sidebar } from './sidebar';
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
          className="flex items-center gap-1 text-muted text-sm hover:text-foreground transition-colors"
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
            className="text-xs text-muted hover:text-foreground transition-colors"
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
              className="text-left p-3 sm:p-4 rounded-xl border border-separator bg-surface/50 hover:bg-default/70 transition-colors overflow-hidden min-w-0"
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
  const activeTaskId = useTaskStore((s) => s.activeTaskId);
  const messagesByTask = useMessageStore((s) => s.messagesByTask);
  const isTerminalOpen = useUIStore((s) => s.isTerminalOpen);
  const isDiffOpen = useUIStore((s) => s.isDiffOpen);
  const toggleTerminal = useUIStore((s) => s.toggleTerminal);
  const toggleDiff = useUIStore((s) => s.toggleDiff);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);

  const storeMessages = activeTaskId ? messagesByTask[activeTaskId] : undefined;
  const messages: ChatMessageData[] = useMemo(
    () =>
      storeMessages?.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        isThinking: m.isThinking,
      })) ?? [],
    [storeMessages]
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  const demoTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const composerRef = useRef<ChatComposerHandle>(null);
  const terminalRef = useRef<TerminalPanelHandle>(null);
  const prevTerminalOpen = useRef(false);

  const personalRoomConfig = useMemo(() => {
    const url = import.meta.env.VITE_PERSONAL_ROOM_URL;
    return typeof url === 'string' && url.length > 0 ? { url } : null;
  }, []);
  const { agents, connectionState } = usePersonalRoom(personalRoomConfig);
  const {
    machines,
    selectedMachineId,
    setSelectedMachineId,
    availableModels,
    availableEnvironments,
    availablePermissionModes,
  } = useMachineSelection(agents);

  const selectedEnvironmentPath = useUIStore((s) => s.selectedEnvironmentPath);
  const setSelectedEnvironmentPath = useUIStore((s) => s.setSelectedEnvironmentPath);
  const [permission, setPermission] = useState<PermissionMode>('default');

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

  const tasks = useTaskStore((s) => s.tasks);
  const createTask = useTaskStore((s) => s.createTask);
  const setActiveTask = useTaskStore((s) => s.setActiveTask);

  const handleNewTask = useCallback(() => {
    const id = createTask('New task');
    setActiveTask(id);
    useMessageStore.getState().clearMessages(id);
  }, [createTask, setActiveTask]);

  const handleNavigateNextTask = useCallback(() => {
    const currentIndex = tasks.findIndex((t) => t.id === activeTaskId);
    const nextIndex = currentIndex + 1;
    const next = tasks[nextIndex];
    if (next) {
      setActiveTask(next.id);
    }
  }, [tasks, activeTaskId, setActiveTask]);

  const handleNavigatePrevTask = useCallback(() => {
    const currentIndex = tasks.findIndex((t) => t.id === activeTaskId);
    const prevIndex = currentIndex - 1;
    const prev = tasks[prevIndex];
    if (prev) {
      setActiveTask(prev.id);
    }
  }, [tasks, activeTaskId, setActiveTask]);

  const handleFocusComposer = useCallback(() => {
    composerRef.current?.focus();
  }, []);

  useAppHotkeys({
    onToggleTerminal: toggleTerminal,
    onToggleDiff: toggleDiff,
    onToggleSidebar: toggleSidebar,
    onNewTask: handleNewTask,
    onOpenSettings: () => {},
    onCommandPalette: () => {},
    onNavigateNextTask: handleNavigateNextTask,
    onNavigatePrevTask: handleNavigatePrevTask,
    onFocusComposer: handleFocusComposer,
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

  const handleSubmit = useCallback(
    (content: string) => {
      if (!activeTaskId) return;

      const msgStore = useMessageStore.getState();

      msgStore.addMessage(activeTaskId, {
        taskId: activeTaskId,
        role: 'user',
        content,
      });

      const thinkingId = msgStore.addMessage(activeTaskId, {
        taskId: activeTaskId,
        role: 'agent',
        content: '',
        isThinking: true,
      });

      demoTimerRef.current = setTimeout(() => {
        useMessageStore.getState().updateMessage(activeTaskId, thinkingId, {
          isThinking: false,
          content:
            "I received your message. This is a static demo, so I can't actually process requests yet. Once connected to the agent backend, I'll be able to help with real tasks.",
        });
      }, 2000);
    },
    [activeTaskId]
  );

  const handleClearChat = useCallback(() => {
    if (!activeTaskId) return;
    useMessageStore.getState().clearMessages(activeTaskId);
  }, [activeTaskId]);

  const hasMessages = messages.length > 0;

  return (
    <div className="flex h-dvh bg-background">
      <Sidebar />
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
          <ChatComposer
            ref={composerRef}
            onSubmit={handleSubmit}
            onClearChat={handleClearChat}
            availableModels={availableModels}
          />
          <StatusBar
            connectionState={connectionState}
            machines={machines}
            selectedMachineId={selectedMachineId}
            onMachineSelect={setSelectedMachineId}
            availableEnvironments={availableEnvironments}
            selectedEnvironmentPath={selectedEnvironmentPath}
            onEnvironmentSelect={setSelectedEnvironmentPath}
            availablePermissionModes={availablePermissionModes}
            permission={permission}
            onPermissionChange={setPermission}
          />
        </div>

        {/* Terminal panel */}
        <TerminalPanel
          ref={terminalRef}
          isOpen={isTerminalOpen}
          onClose={() => useUIStore.getState().setTerminalOpen(false)}
        />
      </div>

      {/* Diff side panel */}
      <DiffPanel isOpen={isDiffOpen} onClose={() => useUIStore.getState().setDiffOpen(false)} />
    </div>
  );
}
