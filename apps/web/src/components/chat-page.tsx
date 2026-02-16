import { change } from '@loro-extended/change';
import type { ContentBlock, PermissionMode } from '@shipyard/loro-schema';
import {
  addTaskToIndex,
  buildDocumentId,
  DEFAULT_EPOCH,
  generateTaskId,
  LOCAL_USER_ID,
  PERMISSION_MODES,
  REASONING_EFFORTS,
  TaskDocumentSchema,
  TaskIndexDocumentSchema,
} from '@shipyard/loro-schema';
import { ChevronDown } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PlanApprovalProvider } from '../contexts/plan-approval-context';
import { useAppHotkeys } from '../hooks/use-app-hotkeys';
import { useMachineSelection } from '../hooks/use-machine-selection';
import { usePersonalRoom } from '../hooks/use-personal-room';
import { useRoomCapabilities } from '../hooks/use-room-capabilities';
import { useTaskDocument } from '../hooks/use-task-document';
import { useTaskIndex } from '../hooks/use-task-index';
import { useWebRTCSync } from '../hooks/use-webrtc-sync';
import { useRepo, useWebRtcAdapter } from '../providers/repo-provider';
import { useAuthStore, useMessageStore, useTaskStore, useUIStore } from '../stores';
import type { ChatComposerHandle, SubmitPayload } from './chat-composer';
import { ChatComposer } from './chat-composer';
import type { ChatMessageData } from './chat-message';
import { ChatMessage } from './chat-message';
import { CommandPalette } from './command-palette';
import type { ReasoningLevel } from './composer/reasoning-effort';
import { StatusBar } from './composer/status-bar';
import { DiffPanelContent } from './panels/diff-panel';
import { PlanPanelContent } from './panels/plan-panel';
import type { SidePanelHandle } from './panels/side-panel';
import { SidePanel } from './panels/side-panel';
import type { TerminalPanelHandle } from './panels/terminal-panel';
import { TerminalPanel } from './panels/terminal-panel';
import { PermissionCard } from './permission-card';
import { SettingsPage } from './settings-page';
import { ShortcutsModal } from './shortcuts-modal';
import { Sidebar } from './sidebar';
import { TopBar } from './top-bar';

const useLoro = import.meta.env.VITE_DATA_SOURCE === 'loro';

const VALID_EFFORTS: readonly string[] = REASONING_EFFORTS;
const VALID_MODES: readonly string[] = PERMISSION_MODES;

function isReasoningLevel(value: string): value is ReasoningLevel {
  return VALID_EFFORTS.includes(value);
}

function isPermissionMode(value: string): value is PermissionMode {
  return VALID_MODES.includes(value);
}

interface ComposerSeedTarget {
  setModel: (v: string) => void;
  setReasoning: (v: ReasoningLevel) => void;
  setPermission: (v: PermissionMode) => void;
  setEnvironment: (v: string) => void;
  seededRef: React.MutableRefObject<string | null>;
}

function seedComposerState(
  taskId: string | null,
  config: {
    model: string | null;
    reasoningEffort: string | null;
    permissionMode: string | null;
    cwd: string | null;
  } | null,
  target: ComposerSeedTarget
): void {
  if (taskId !== target.seededRef.current) target.seededRef.current = null;

  if (!config && !taskId) {
    target.setModel('claude-opus-4-6');
    target.setReasoning('medium');
    target.setPermission('default');
    return;
  }
  if (!config || target.seededRef.current === taskId) return;
  target.seededRef.current = taskId;

  if (config.model) target.setModel(config.model);
  if (config.reasoningEffort && isReasoningLevel(config.reasoningEffort)) {
    target.setReasoning(config.reasoningEffort);
  }
  if (config.permissionMode && isPermissionMode(config.permissionMode)) {
    target.setPermission(config.permissionMode);
  }
  if (config.cwd) target.setEnvironment(config.cwd);
}

/** Wrap a plain text string into a ContentBlock[] for the legacy message store path. */
function toContentBlocks(text: string): ContentBlock[] {
  if (!text) return [];
  return [{ type: 'text' as const, text }];
}

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

interface HeroStateProps {
  onSuggestionClick: (text: string) => void;
  environmentLabel?: string;
}

function HeroState({ onSuggestionClick, environmentLabel }: HeroStateProps) {
  return (
    <div className="flex flex-col items-center flex-1 w-full max-w-3xl mx-auto px-3 sm:px-4 min-h-0 overflow-hidden">
      <div className="flex-1 min-h-0" />

      <div className="flex flex-col items-center gap-4 shrink-0">
        <img
          src="/icon.svg"
          alt=""
          className="w-16 h-16 sm:w-20 sm:h-20 object-contain opacity-80 shrink-0"
        />
        <h1 className="text-xl sm:text-2xl font-semibold text-foreground shrink-0">
          What are we building?
        </h1>
        <button
          type="button"
          aria-label="Select project"
          className="flex items-center gap-1 text-muted text-sm hover:text-foreground transition-colors shrink-0"
        >
          {environmentLabel ?? 'New project'}
          <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      </div>

      <div className="flex-1 min-h-0" />

      <div className="w-full shrink-0">
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

      <div className="flex-1 min-h-0" />
    </div>
  );
}

export function ChatPage() {
  const activeTaskId = useTaskStore((s) => s.activeTaskId);
  const setActiveTask = useTaskStore((s) => s.setActiveTask);
  const messagesByTask = useMessageStore((s) => s.messagesByTask);
  const isTerminalOpen = useUIStore((s) => s.isTerminalOpen);
  const activeSidePanel = useUIStore((s) => s.activeSidePanel);
  const isSettingsOpen = useUIStore((s) => s.isSettingsOpen);
  const toggleTerminal = useUIStore((s) => s.toggleTerminal);
  const toggleSidePanel = useUIStore((s) => s.toggleSidePanel);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const setSettingsOpen = useUIStore((s) => s.setSettingsOpen);
  const setSidebarExpanded = useUIStore((s) => s.setSidebarExpanded);

  const authToken = useAuthStore((s) => s.token);
  const authUser = useAuthStore((s) => s.user);

  const personalRoomConfig = useMemo(() => {
    if (!authToken || !authUser) return null;
    const base = import.meta.env.VITE_SESSION_SERVER_URL;
    if (typeof base !== 'string' || base.length === 0) return null;
    const wsBase = base.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
    return {
      url: `${wsBase}/personal/${encodeURIComponent(authUser.id)}?token=${encodeURIComponent(authToken)}`,
    };
  }, [authToken, authUser]);
  const { agents, connectionState, connection, lastTaskAck } = usePersonalRoom(personalRoomConfig);
  const capabilitiesByMachine = useRoomCapabilities(LOCAL_USER_ID);
  const {
    machines,
    selectedMachineId,
    setSelectedMachineId,
    availableModels,
    availableEnvironments,
    homeDir,
  } = useMachineSelection(agents, capabilitiesByMachine);

  const repo = useRepo();
  const webrtcAdapter = useWebRtcAdapter();
  const { peerState: _peerState, terminalChannel } = useWebRTCSync({
    connection,
    webrtcAdapter,
    targetMachineId: selectedMachineId,
  });

  const diffLastViewedAt = useUIStore((s) => s.diffLastViewedAt);
  const setDiffLastViewedAt = useUIStore((s) => s.setDiffLastViewedAt);
  const diffScope = useUIStore((s) => s.diffScope);

  const loroTask = useTaskDocument(activeTaskId);
  const { pendingPermissions, respondToPermission, plans } = loroTask;

  const { taskIndex } = useTaskIndex(LOCAL_USER_ID);
  const taskList = useMemo(
    () => Object.values(taskIndex).sort((a, b) => b.updatedAt - a.updatedAt),
    [taskIndex]
  );

  const storeMessages = activeTaskId ? messagesByTask[activeTaskId] : undefined;

  const lastSubmittedModelRef = useRef<string | null>(null);

  /** Build a lookup from model IDs to human-readable labels using available models. */
  const modelLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of availableModels) {
      map.set(m.id, m.label);
    }
    return map;
  }, [availableModels]);

  const messages: ChatMessageData[] = useMemo(() => {
    /** Convert a raw model ID like "claude-opus-4-6" to a display label. */
    function resolveModelLabel(modelId: string | null | undefined): string | undefined {
      if (!modelId) return undefined;
      const known = modelLabelMap.get(modelId);
      if (known) return known;
      return modelId
        .replace(/-(\d{8})$/, '')
        .split('-')
        .map((part) =>
          /^\d+$/.test(part) ? `${part}.` : part.charAt(0).toUpperCase() + part.slice(1)
        )
        .join(' ')
        .replace(/\.\s/g, '.')
        .replace(/\.$/, '');
    }

    let raw: ChatMessageData[];

    if (useLoro && loroTask.conversation.length > 0) {
      raw = loroTask.conversation.map((msg) => ({
        id: msg.messageId ?? crypto.randomUUID(),
        role: msg.role,
        content: msg.content,
        agentName: msg.role === 'assistant' ? resolveModelLabel(msg.model) : undefined,
      }));

      const status = loroTask.meta?.status;
      const isInFlight = status === 'submitted' || status === 'working';
      const lastMsg = raw[raw.length - 1];
      if (isInFlight && lastMsg?.role === 'user') {
        raw.push({
          id: '__thinking__',
          role: 'assistant' as const,
          content: [],
          isThinking: true,
          agentName: resolveModelLabel(lastSubmittedModelRef.current),
        });
      }
    } else {
      raw =
        storeMessages?.map((m) => ({
          id: m.id,
          role: m.role,
          content: toContentBlocks(m.content),
          isThinking: m.isThinking,
        })) ?? [];
    }

    /** Group consecutive messages with the same role into a single entry. */
    const grouped: ChatMessageData[] = [];
    for (const msg of raw) {
      const last = grouped[grouped.length - 1];
      if (
        last &&
        last.role === msg.role &&
        last.agentName === msg.agentName &&
        !last.isThinking &&
        !msg.isThinking
      ) {
        last.content = [...last.content, ...msg.content];
      } else {
        grouped.push({ ...msg, content: [...msg.content] });
      }
    }
    return grouped;
  }, [loroTask.conversation, loroTask.meta?.status, storeMessages, modelLabelMap]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const demoTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const composerRef = useRef<ChatComposerHandle>(null);
  const terminalRef = useRef<TerminalPanelHandle>(null);
  const sidePanelRef = useRef<SidePanelHandle>(null);
  const prevTerminalOpen = useRef(false);
  const prevSidePanelOpen = useRef(false);

  const selectedEnvironmentPath = useUIStore((s) => s.selectedEnvironmentPath);
  const setSelectedEnvironmentPath = useUIStore((s) => s.setSelectedEnvironmentPath);

  const [composerModel, setComposerModel] = useState('claude-opus-4-6');
  const [composerReasoning, setComposerReasoning] = useState<ReasoningLevel>('medium');
  const [composerPermission, setComposerPermission] = useState<PermissionMode>('default');

  const seededTaskRef = useRef<string | null>(null);

  useEffect(() => {
    seedComposerState(activeTaskId, loroTask.lastUserConfig, {
      setModel: setComposerModel,
      setReasoning: setComposerReasoning,
      setPermission: setComposerPermission,
      setEnvironment: setSelectedEnvironmentPath,
      seededRef: seededTaskRef,
    });
  }, [activeTaskId, loroTask.lastUserConfig, setSelectedEnvironmentPath]);

  useEffect(() => {
    if (availableModels.length === 0) return;
    if (!availableModels.some((m) => m.id === composerModel)) {
      setComposerModel(availableModels[0]?.id ?? 'claude-opus-4-6');
    }
  }, [availableModels, composerModel]);

  useEffect(() => {
    if (!homeDir) {
      const firstEnv = availableEnvironments[0]?.path ?? null;
      setSelectedEnvironmentPath(firstEnv);
    } else {
      setSelectedEnvironmentPath(null);
    }
  }, [selectedMachineId, availableEnvironments, homeDir, setSelectedEnvironmentPath]);

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

  useEffect(() => {
    const isOpen = activeSidePanel !== null;
    const wasOpen = prevSidePanelOpen.current;

    if (isOpen && !wasOpen) {
      if (activeSidePanel === 'diff') setDiffLastViewedAt(Date.now());
      requestAnimationFrame(() => {
        sidePanelRef.current?.focus();
      });
    } else if (!isOpen && wasOpen) {
      requestAnimationFrame(() => {
        composerRef.current?.focus();
      });
    }
    prevSidePanelOpen.current = isOpen;
  }, [activeSidePanel, setDiffLastViewedAt]);

  useEffect(() => {
    if (activeSidePanel !== null && typeof window !== 'undefined' && window.innerWidth < 1280) {
      setSidebarExpanded(false);
    }
  }, [activeSidePanel, setSidebarExpanded]);

  useEffect(() => {
    if (!isTerminalOpen) {
      requestAnimationFrame(() => {
        composerRef.current?.focus();
      });
    }
  }, [activeTaskId, isTerminalOpen]);

  const handleNewTask = useCallback(() => {
    setActiveTask(null);
  }, [setActiveTask]);

  const handleNavigateNextTask = useCallback(() => {
    const currentIndex = taskList.findIndex((t) => t.taskId === activeTaskId);
    const nextIndex = currentIndex + 1;
    const next = taskList[nextIndex];
    if (next) {
      setActiveTask(next.taskId);
    }
  }, [taskList, activeTaskId, setActiveTask]);

  const handleNavigatePrevTask = useCallback(() => {
    const currentIndex = taskList.findIndex((t) => t.taskId === activeTaskId);
    const prevIndex = currentIndex - 1;
    const prev = taskList[prevIndex];
    if (prev) {
      setActiveTask(prev.taskId);
    }
  }, [taskList, activeTaskId, setActiveTask]);

  const handleFocusComposer = useCallback(() => {
    composerRef.current?.focus();
  }, []);

  const toggleSettings = useUIStore((s) => s.toggleSettings);

  const handleCloseSettings = useCallback(() => {
    setSettingsOpen(false);
  }, [setSettingsOpen]);

  useAppHotkeys({
    onToggleTerminal: toggleTerminal,
    onToggleDiff: useCallback(() => {
      const current = useUIStore.getState().activeSidePanel;
      if (current !== null) {
        useUIStore.getState().setActiveSidePanel(null);
      } else {
        toggleSidePanel('diff');
      }
    }, [toggleSidePanel]),
    onTogglePlan: useCallback(() => {
      const current = useUIStore.getState().activeSidePanel;
      if (current !== null) {
        useUIStore.getState().setActiveSidePanel(null);
      } else {
        toggleSidePanel('plan');
      }
    }, [toggleSidePanel]),
    onToggleSidebar: toggleSidebar,
    onNewTask: handleNewTask,
    onOpenSettings: toggleSettings,
    onCommandPalette: () => useUIStore.getState().toggleCommandPalette(),
    onNavigateNextTask: handleNavigateNextTask,
    onNavigatePrevTask: handleNavigatePrevTask,
    onFocusComposer: handleFocusComposer,
    onShowShortcuts: () => useUIStore.getState().toggleShortcutsModal(),
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

  useEffect(() => {
    if (!lastTaskAck || !activeTaskId) return;

    if (lastTaskAck.accepted) return;

    const msgStore = useMessageStore.getState();
    const taskMessages = msgStore.messagesByTask[activeTaskId] ?? [];
    const thinking = taskMessages.find((m) => m.isThinking);
    if (thinking) {
      msgStore.updateMessage(activeTaskId, thinking.id, {
        isThinking: false,
        content: `Task rejected: ${lastTaskAck.error ?? 'Unknown error'}`,
      });
    }
  }, [lastTaskAck, activeTaskId]);

  /** NOTE: Ref avoids re-subscribing to connection.onMessage on every status change */
  const taskStatusRef = useRef(loroTask.meta?.status);
  taskStatusRef.current = loroTask.meta?.status;

  useEffect(() => {
    if (!connection || !activeTaskId || !selectedMachineId) return;

    const unsub = connection.onMessage((msg) => {
      if (msg.type === 'agent-joined' && msg.agent.machineId === selectedMachineId) {
        const status = taskStatusRef.current;
        const isInFlight = status === 'submitted' || status === 'working';
        if (isInFlight) {
          connection.send({
            type: 'notify-task',
            requestId: crypto.randomUUID(),
            machineId: selectedMachineId,
            taskId: activeTaskId,
          });
        }
      }
    });

    return unsub;
  }, [connection, activeTaskId, selectedMachineId]);

  const handleSubmit = useCallback(
    (payload: SubmitPayload) => {
      const { message, model, reasoningEffort, permissionMode } = payload;
      lastSubmittedModelRef.current = model || null;
      const taskId = generateTaskId();
      let currentTaskId: string;

      if (activeTaskId) {
        currentTaskId = activeTaskId;
      } else {
        currentTaskId = taskId;
        setActiveTask(currentTaskId);
        useMessageStore.getState().clearMessages(currentTaskId);
      }

      const msgStore = useMessageStore.getState();

      msgStore.addMessage(currentTaskId, {
        taskId: currentTaskId,
        role: 'user',
        content: message,
      });

      const thinkingId = msgStore.addMessage(currentTaskId, {
        taskId: currentTaskId,
        role: 'assistant',
        content: '',
        isThinking: true,
      });

      if (useLoro && repo) {
        const docId = buildDocumentId('task', currentTaskId, DEFAULT_EPOCH);
        const handle = repo.get(docId, TaskDocumentSchema);

        const now = Date.now();
        const isNewTask = handle.loroDoc.opCount() === 0;

        change(handle.doc, (draft) => {
          if (isNewTask) {
            draft.meta.id = currentTaskId;
            draft.meta.title = message.slice(0, 80);
            draft.meta.createdAt = now;
          }
          draft.meta.status = 'submitted';
          draft.meta.updatedAt = now;

          draft.conversation.push({
            messageId: crypto.randomUUID(),
            role: 'user',
            content: [{ type: 'text', text: message }],
            timestamp: now,
            model: model || null,
            machineId: selectedMachineId ?? null,
            reasoningEffort,
            permissionMode,
            cwd: selectedEnvironmentPath ?? homeDir ?? null,
          });
        });

        if (isNewTask) {
          const roomDocId = buildDocumentId('room', LOCAL_USER_ID, DEFAULT_EPOCH);
          // eslint-disable-next-line no-restricted-syntax -- loro-extended generics require explicit cast
          const roomHandle = repo.get(roomDocId, TaskIndexDocumentSchema as never);
          addTaskToIndex(roomHandle.doc, {
            taskId: currentTaskId,
            title: message.slice(0, 80),
            status: 'submitted',
            createdAt: now,
            updatedAt: now,
          });
        }
      }

      if (connection && selectedMachineId) {
        connection.send({
          type: 'notify-task',
          requestId: crypto.randomUUID(),
          machineId: selectedMachineId,
          taskId: currentTaskId,
        });
      } else {
        demoTimerRef.current = setTimeout(() => {
          useMessageStore.getState().updateMessage(currentTaskId, thinkingId, {
            isThinking: false,
            content:
              'No machine connected. Select a machine and ensure the connection is active to send tasks to an agent.',
          });
        }, 500);
      }
    },
    [
      activeTaskId,
      setActiveTask,
      connection,
      selectedMachineId,
      selectedEnvironmentPath,
      homeDir,
      repo,
    ]
  );

  const handleClearChat = useCallback(() => {
    if (!activeTaskId) return;
    useMessageStore.getState().clearMessages(activeTaskId);
  }, [activeTaskId]);

  const hasUnviewedDiff = useMemo(() => {
    if (activeSidePanel === 'diff') return false;
    const ds = loroTask.diffState;
    if (!ds) return false;
    const relevantUpdatedAt =
      diffScope === 'branch'
        ? ds.branchUpdatedAt
        : diffScope === 'last-turn'
          ? ds.lastTurnUpdatedAt
          : ds.updatedAt;
    return relevantUpdatedAt > diffLastViewedAt;
  }, [activeSidePanel, loroTask.diffState, diffScope, diffLastViewedAt]);

  const hasMessages = messages.length > 0;

  const selectedEnv = availableEnvironments.find((e) => e.path === selectedEnvironmentPath);
  const heroEnvironmentLabel = selectedEnv
    ? homeDir && selectedEnv.path === homeDir
      ? '~ (Home)'
      : `${selectedEnv.name} (${selectedEnv.branch})`
    : homeDir
      ? '~ (Home)'
      : undefined;

  return (
    <PlanApprovalProvider
      pendingPermissions={pendingPermissions}
      respondToPermission={respondToPermission}
      plans={plans}
    >
      <div className="flex h-dvh overflow-hidden bg-background">
        <CommandPalette />
        <ShortcutsModal />
        <Sidebar />
        <div className="flex flex-col flex-1 min-w-0 min-h-0" tabIndex={-1}>
          <TopBar
            onToggleTerminal={toggleTerminal}
            onToggleSidePanel={useCallback(() => toggleSidePanel('diff'), [toggleSidePanel])}
            hasUnviewedDiff={hasUnviewedDiff}
          />

          <main id="main-content" className="flex flex-col flex-1 min-h-0">
            {isSettingsOpen ? (
              <SettingsPage onBack={handleCloseSettings} />
            ) : (
              <>
                {/* Chat area */}
                {hasMessages ? (
                  <div
                    ref={scrollRef}
                    className="flex-1 min-h-0 overflow-y-auto"
                    role="log"
                    aria-label="Chat messages"
                    aria-relevant="additions"
                  >
                    <div className="max-w-3xl mx-auto px-3 sm:px-4 py-3 sm:py-4 space-y-2.5 sm:space-y-4">
                      {messages.map((msg) => (
                        <ChatMessage key={msg.id} message={msg} />
                      ))}
                      {pendingPermissions.size > 0 && (
                        <div
                          className="space-y-3"
                          role="region"
                          aria-label="Pending permission requests"
                          aria-live="polite"
                        >
                          {Array.from(pendingPermissions.entries())
                            .filter(([_toolUseId, request]) => request.toolName !== 'ExitPlanMode')
                            .map(([toolUseId, request]) => (
                              <PermissionCard
                                key={toolUseId}
                                toolUseId={toolUseId}
                                request={request}
                                onRespond={respondToPermission}
                              />
                            ))}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <HeroState
                    environmentLabel={heroEnvironmentLabel}
                    onSuggestionClick={(text) =>
                      handleSubmit({
                        message: text,
                        model: composerModel,
                        reasoningEffort: composerReasoning,
                        permissionMode: composerPermission,
                      })
                    }
                  />
                )}

                {/* Composer */}
                <div className="shrink-0 w-full max-w-3xl mx-auto px-3 sm:px-4">
                  <ChatComposer
                    ref={composerRef}
                    onSubmit={handleSubmit}
                    onClearChat={handleClearChat}
                    availableModels={availableModels}
                    availableEnvironments={availableEnvironments}
                    onEnvironmentSelect={setSelectedEnvironmentPath}
                    selectedModelId={composerModel}
                    onModelChange={setComposerModel}
                    reasoningLevel={composerReasoning}
                    onReasoningChange={setComposerReasoning}
                    permissionMode={composerPermission}
                    onPermissionChange={setComposerPermission}
                  />
                  <StatusBar
                    connectionState={connectionState}
                    machines={machines}
                    selectedMachineId={selectedMachineId}
                    onMachineSelect={setSelectedMachineId}
                    availableEnvironments={availableEnvironments}
                    selectedEnvironmentPath={selectedEnvironmentPath}
                    onEnvironmentSelect={setSelectedEnvironmentPath}
                    homeDir={homeDir}
                  />
                </div>
              </>
            )}
          </main>

          {/* Terminal panel */}
          <TerminalPanel
            ref={terminalRef}
            isOpen={isTerminalOpen}
            onClose={() => useUIStore.getState().setTerminalOpen(false)}
            terminalChannel={terminalChannel}
            selectedEnvironmentPath={selectedEnvironmentPath}
          />
        </div>

        {/* Side panel (diff / plan) */}
        <SidePanel ref={sidePanelRef}>
          <div className={activeSidePanel === 'diff' ? 'contents' : 'hidden'}>
            <DiffPanelContent activeTaskId={activeTaskId} />
          </div>
          <div className={activeSidePanel === 'plan' ? 'contents' : 'hidden'}>
            <PlanPanelContent activeTaskId={activeTaskId} />
          </div>
        </SidePanel>
      </div>
    </PlanApprovalProvider>
  );
}
