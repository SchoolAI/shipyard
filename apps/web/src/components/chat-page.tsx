import { change, type TypedDoc } from '@loro-extended/change';
import { useDoc } from '@loro-extended/react';
import type {
  ContentBlock,
  PermissionMode,
  WorktreeScriptValue,
  WorktreeSetupStatus,
} from '@shipyard/loro-schema';
import {
  addTaskToIndex,
  buildDocumentId,
  buildTaskConvDocId,
  buildTaskMetaDocId,
  buildTaskReviewDocId,
  DEFAULT_EPOCH,
  generateTaskId,
  LOCAL_USER_ID,
  PERMISSION_MODES,
  REASONING_EFFORTS,
  ROOM_EPHEMERAL_DECLARATIONS,
  TaskConversationDocumentSchema,
  TaskIndexDocumentSchema,
  type TaskIndexDocumentShape,
  TaskMetaDocumentSchema,
  TaskReviewDocumentSchema,
  TERMINAL_TASK_STATES,
} from '@shipyard/loro-schema';
import { ChevronDown } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FeedbackProvider } from '../contexts/feedback-context';
import { PlanApprovalProvider } from '../contexts/plan-approval-context';
import { useAppHotkeys } from '../hooks/use-app-hotkeys';
import { useCreateWorktree } from '../hooks/use-create-worktree';
import { useEnhancePrompt } from '../hooks/use-enhance-prompt';
import {
  AUTOFOCUS_DELAY_MS,
  FOCUS_PRIORITY,
  FocusHierarchyProvider,
  useFocusHierarchy,
  useFocusTarget,
} from '../hooks/use-focus-hierarchy';
import type { GitRepoInfo } from '../hooks/use-machine-selection';
import { useMachineSelection } from '../hooks/use-machine-selection';
import type { ConnectionState } from '../hooks/use-personal-room';
import { usePersonalRoom } from '../hooks/use-personal-room';
import { useRoomCapabilities } from '../hooks/use-room-capabilities';
import { useRoomHandle } from '../hooks/use-room-handle';
import { useTaskDocument } from '../hooks/use-task-document';
import { useTaskIndex } from '../hooks/use-task-index';
import { useVisualViewport } from '../hooks/use-visual-viewport';
import { useVoiceInput } from '../hooks/use-voice-input';
import { useWebRTCSync } from '../hooks/use-webrtc-sync';
import { useRepo, useWebRtcAdapter } from '../providers/repo-provider';
import { useAuthStore, useMessageStore, useTaskStore, useUIStore } from '../stores';
import { formatBrowserFeedback } from '../utils/format-feedback';
import { navigateFromSettings, navigateToSettings } from '../utils/url-sync';
import { extractBranchFromWorktreePath } from '../utils/worktree-helpers';
import { AgentStatusCard } from './agent-status-card';
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
import { WorktreeCreationModal } from './worktree-creation-modal';
import { WorktreeProgressCard } from './worktree-progress-card';

const useLoro = import.meta.env.VITE_DATA_SOURCE === 'loro';

const VALID_EFFORTS: readonly string[] = REASONING_EFFORTS;
const VALID_MODES: readonly string[] = PERMISSION_MODES;

function isReasoningLevel(value: string): value is ReasoningLevel {
  return VALID_EFFORTS.includes(value);
}

function isPermissionMode(value: string): value is PermissionMode {
  return VALID_MODES.includes(value);
}

function toReasoningLevel(value: string | null): ReasoningLevel | null {
  if (value && isReasoningLevel(value)) return value;
  return null;
}

function toPermissionMode(value: string | null): PermissionMode | null {
  if (value && isPermissionMode(value)) return value;
  return null;
}

const SCROLL_THRESHOLD = 80;

interface ComposerSeedTarget {
  setModel: (v: string) => void;
  setReasoning: (v: ReasoningLevel) => void;
  setPermission: (v: PermissionMode) => void;
  setEnvironment: (v: string | null) => void;
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
    target.setEnvironment(null);
    return;
  }
  if (!config) {
    target.setEnvironment(null);
    return;
  }
  if (target.seededRef.current === taskId) return;
  target.seededRef.current = taskId;

  if (config.model) target.setModel(config.model);
  if (config.reasoningEffort && isReasoningLevel(config.reasoningEffort)) {
    target.setReasoning(config.reasoningEffort);
  }
  if (config.permissionMode && isPermissionMode(config.permissionMode)) {
    target.setPermission(config.permissionMode);
  }
  target.setEnvironment(config.cwd);
}

function buildAutoAttachFeedback(
  message: string,
  diffComments: import('@shipyard/loro-schema').DiffComment[],
  planComments: import('@shipyard/loro-schema').PlanComment[],
  deliveredCommentIds: string[]
): { fullMessage: string; commentIdsToDeliver: string[] } {
  const deliveredSet = new Set(deliveredCommentIds);
  const unresolvedDiff = diffComments.filter(
    (c) => c.resolvedAt === null && !deliveredSet.has(c.commentId)
  );
  const unresolvedPlan = planComments.filter(
    (c) => c.resolvedAt === null && !deliveredSet.has(c.commentId)
  );
  const feedback =
    unresolvedDiff.length > 0 || unresolvedPlan.length > 0
      ? formatBrowserFeedback(unresolvedDiff, unresolvedPlan)
      : '';
  const ids = [
    ...unresolvedDiff.map((c) => c.commentId),
    ...unresolvedPlan.map((c) => c.commentId),
  ];
  const fullMessage = feedback
    ? message
      ? `${message}\n\n---\n\n${feedback}`
      : feedback
    : message;
  return { fullMessage, commentIdsToDeliver: ids };
}

/** Wrap a plain text + images into ContentBlock[] for the legacy message store path. */
function toContentBlocks(text: string, images?: SubmitPayload['images']): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  if (text) blocks.push({ type: 'text' as const, text });
  if (images) {
    for (const img of images) {
      blocks.push({
        type: 'image' as const,
        id: crypto.randomUUID(),
        source: { type: 'base64' as const, mediaType: img.mediaType, data: img.data },
      });
    }
  }
  return blocks;
}

function writeCrdtDocs(
  repo: ReturnType<typeof useRepo>,
  opts: {
    currentTaskId: string;
    message: string;
    payload: SubmitPayload;
    model: string | undefined;
    reasoningEffort: import('@shipyard/loro-schema').ReasoningEffort | null;
    permissionMode: import('@shipyard/loro-schema').PermissionMode | null;
    diffComments: import('@shipyard/loro-schema').DiffComment[];
    planComments: import('@shipyard/loro-schema').PlanComment[];
    deliveredCommentIds: string[];
    selectedMachineId: string | null | undefined;
    selectedEnvironmentPath: string | null | undefined;
    homeDir: string | null | undefined;
    isAgentRunning: boolean;
  }
) {
  const now = Date.now();
  const {
    currentTaskId,
    message,
    payload,
    model,
    reasoningEffort,
    permissionMode,
    diffComments,
    planComments,
    deliveredCommentIds,
    selectedMachineId,
    selectedEnvironmentPath,
    homeDir,
    isAgentRunning,
  } = opts;

  const metaDocId = buildTaskMetaDocId(currentTaskId, DEFAULT_EPOCH);
  const metaDocHandle = repo.get(metaDocId, TaskMetaDocumentSchema);
  const isNewTask = metaDocHandle.loroDoc.opCount() === 0;

  const { fullMessage, commentIdsToDeliver } = buildAutoAttachFeedback(
    message,
    diffComments,
    planComments,
    deliveredCommentIds
  );

  change(metaDocHandle.doc, (draft) => {
    if (isNewTask) {
      draft.meta.id = currentTaskId;
      draft.meta.title = message.slice(0, 80);
      draft.meta.createdAt = now;
    }
    if (!isAgentRunning) {
      draft.meta.status = 'submitted';
    }
    draft.meta.updatedAt = now;
  });

  if (commentIdsToDeliver.length > 0) {
    const reviewDocId = buildTaskReviewDocId(currentTaskId, DEFAULT_EPOCH);
    const reviewDocHandle = repo.get(reviewDocId, TaskReviewDocumentSchema);
    change(reviewDocHandle.doc, (draft) => {
      for (const id of commentIdsToDeliver) {
        draft.deliveredCommentIds.push(id);
      }
    });
  }

  const convDocId = buildTaskConvDocId(currentTaskId, DEFAULT_EPOCH);
  const convDocHandle = repo.get(convDocId, TaskConversationDocumentSchema);
  change(convDocHandle.doc, (draft) => {
    const contentBlocks: ContentBlock[] = [];
    if (fullMessage) contentBlocks.push({ type: 'text', text: fullMessage });
    for (const img of payload.images) {
      contentBlocks.push({
        type: 'image',
        id: crypto.randomUUID(),
        source: { type: 'base64', mediaType: img.mediaType, data: img.data },
      });
    }

    const userMessage = {
      messageId: crypto.randomUUID(),
      role: 'user' as const,
      content: contentBlocks,
      timestamp: now,
      model: model || null,
      machineId: selectedMachineId ?? null,
      reasoningEffort,
      permissionMode,
      cwd: selectedEnvironmentPath ?? homeDir ?? null,
    };

    if (isAgentRunning) {
      draft.pendingFollowUps.push(userMessage);
    } else {
      draft.conversation.push(userMessage);
    }
  });

  if (isNewTask) {
    const roomDocId = buildDocumentId('room', LOCAL_USER_ID, DEFAULT_EPOCH);
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

const ONE_HOUR_MS = 60 * 60 * 1000;

/**
 * Compute a relevance sort key for a setup entry.
 * Returns null if the entry is not relevant (terminal and too old).
 * `running` entries are always relevant; terminal entries only within the last hour.
 */
function setupEntrySortKey(entry: WorktreeSetupStatus, recentCutoff: number): number | null {
  if (entry.status === 'running') return entry.startedAt ?? 0;
  if (entry.completedAt && entry.completedAt > recentCutoff) return entry.completedAt;
  return null;
}

/**
 * Find the most relevant worktree setup entry from the CRDT that should be
 * shown as a reconstructed progress card on page load. Returns null if
 * no entry qualifies.
 */
function findRecentSetupEntry(
  record: Record<string, WorktreeSetupStatus>
): { worktreePath: string; entry: WorktreeSetupStatus } | null {
  const recentCutoff = Date.now() - ONE_HOUR_MS;
  let best: { worktreePath: string; entry: WorktreeSetupStatus; sortKey: number } | null = null;

  for (const [worktreePath, entry] of Object.entries(record)) {
    const sortKey = setupEntrySortKey(entry, recentCutoff);
    if (sortKey !== null && (!best || sortKey > best.sortKey)) {
      best = { worktreePath, entry, sortKey };
    }
  }

  if (!best) return null;
  return { worktreePath: best.worktreePath, entry: best.entry };
}

function getSubmitDisabledReason(
  canSubmit: boolean,
  connectionState: ConnectionState
): string | undefined {
  if (canSubmit) return undefined;
  if (connectionState !== 'connected') return 'Connecting to Shipyard...';
  return 'Select a machine to send messages';
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
  canSubmit?: boolean;
}

function HeroState({ onSuggestionClick, environmentLabel, canSubmit = true }: HeroStateProps) {
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
              disabled={!canSubmit}
              className={`text-left p-3 sm:p-4 rounded-xl border border-separator bg-surface/50 transition-colors overflow-hidden min-w-0 ${canSubmit ? 'hover:bg-default/70' : 'opacity-50 cursor-not-allowed'}`}
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
  return (
    <FocusHierarchyProvider>
      <ChatPageInner />
    </FocusHierarchyProvider>
  );
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: page-level orchestrator integrating many hooks and conditional UI
function ChatPageInner() {
  const activeTaskId = useTaskStore((s) => s.activeTaskId);
  const setActiveTask = useTaskStore((s) => s.setActiveTask);
  const messagesByTask = useMessageStore((s) => s.messagesByTask);
  const isTerminalOpen = useUIStore((s) => s.isTerminalOpen);
  const activeSidePanel = useUIStore((s) => s.activeSidePanel);
  const isSettingsOpen = useUIStore((s) => s.isSettingsOpen);
  const toggleTerminal = useUIStore((s) => s.toggleTerminal);
  const toggleSidePanel = useUIStore((s) => s.toggleSidePanel);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const setSidebarExpanded = useUIStore((s) => s.setSidebarExpanded);

  const visualViewportHeight = useVisualViewport();

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
  const { agents, connectionState, connection, lastTaskAck, lastControlAck } =
    usePersonalRoom(personalRoomConfig);
  const roomHandle = useRoomHandle(LOCAL_USER_ID);
  const capabilitiesByMachine = useRoomCapabilities(LOCAL_USER_ID);

  const loroTask = useTaskDocument(activeTaskId);
  const {
    pendingPermissions,
    respondToPermission,
    plans,
    diffComments,
    planComments,
    deliveredCommentIds,
    markCommentsDelivered,
    sessions,
  } = loroTask;

  const totalCostUsd = useMemo(() => {
    const sum = sessions.reduce((acc, s) => acc + (s.totalCostUsd ?? 0), 0);
    return sum > 0 ? sum : null;
  }, [sessions]);
  const taskHasUserMessage = useMemo(
    () => !!activeTaskId && (loroTask.conversation?.some((m) => m.role === 'user') ?? false),
    [activeTaskId, loroTask.conversation]
  );

  const {
    machines,
    selectedMachineId,
    setSelectedMachineId,
    availableModels,
    availableEnvironments,
    homeDir,
    capabilitiesByMachine: capsByMachine,
  } = useMachineSelection(agents, capabilitiesByMachine, taskHasUserMessage);

  const repo = useRepo();
  const webrtcAdapter = useWebRtcAdapter();
  const { peerState, createTerminalChannel } = useWebRTCSync({
    connection,
    webrtcAdapter,
    targetMachineId: selectedMachineId,
    connectionState,
  });

  const diffLastViewedAt = useUIStore((s) => s.diffLastViewedAt);
  const setDiffLastViewedAt = useUIStore((s) => s.setDiffLastViewedAt);
  const diffScope = useUIStore((s) => s.diffScope);

  const taskStatus = loroTask.meta?.status;
  const isAgentRunning =
    taskStatus === 'submitted' || taskStatus === 'starting' || taskStatus === 'working';
  const isAgentFailed = taskStatus === 'failed';

  const { taskIndex } = useTaskIndex(LOCAL_USER_ID);
  const taskList = useMemo(
    () => Object.values(taskIndex).sort((a, b) => b.updatedAt - a.updatedAt),
    [taskIndex]
  );

  /**
   * Subscribe to worktreeSetupStatus from the room CRDT document.
   * This is the durable fallback for setup script results -- the browser reads
   * this on mount (after a refresh) or when a CRDT sync arrives late.
   * The ephemeral subscription below handles the instant fast path.
   */
  const roomDocId = useMemo(() => buildDocumentId('room', LOCAL_USER_ID, DEFAULT_EPOCH), []);
  // eslint-disable-next-line no-restricted-syntax -- loro-extended generics require explicit cast
  const roomDocHandle = useMemo(
    () => repo.get(roomDocId, TaskIndexDocumentSchema as never, ROOM_EPHEMERAL_DECLARATIONS),
    [repo, roomDocId]
  );
  // eslint-disable-next-line no-restricted-syntax -- loro-extended generic erasure requires cast from TypedDoc<never> to concrete shape
  const roomTypedDoc = roomDocHandle.doc as unknown as TypedDoc<TaskIndexDocumentShape>;
  const worktreeSetupStatusRecord = useDoc(
    roomDocHandle,
    (d: { worktreeSetupStatus: Record<string, WorktreeSetupStatus> }) => d.worktreeSetupStatus
  );

  const crdtComposerModel = useDoc(
    roomDocHandle,
    (d: { userSettings: { composerModel: string | null } }) => d.userSettings.composerModel
  );
  const crdtComposerReasoning = useDoc(
    roomDocHandle,
    (d: { userSettings: { composerReasoning: string | null } }) => d.userSettings.composerReasoning
  );
  const crdtComposerPermission = useDoc(
    roomDocHandle,
    (d: { userSettings: { composerPermission: string | null } }) =>
      d.userSettings.composerPermission
  );

  const storeMessages = activeTaskId ? messagesByTask[activeTaskId] : undefined;

  const lastSubmittedModelRef = useRef<string | null>(null);

  const [stoppingTaskId, setStoppingTaskId] = useState<string | null>(null);
  const isStopping = stoppingTaskId === activeTaskId;
  const pendingInterruptPayloadRef = useRef<SubmitPayload | null>(null);
  const handleSubmitRef = useRef<((payload: SubmitPayload) => void) | null>(null);

  const handleStopAgent = useCallback(() => {
    if (!connection || !activeTaskId || !selectedMachineId) return;
    if (stoppingTaskId === activeTaskId) return;
    setStoppingTaskId(activeTaskId);
    connection.send({
      type: 'cancel-task',
      requestId: crypto.randomUUID(),
      machineId: selectedMachineId,
      taskId: activeTaskId,
    });
  }, [connection, activeTaskId, selectedMachineId, stoppingTaskId]);

  useEffect(() => {
    if (!isAgentRunning && stoppingTaskId === activeTaskId) {
      setStoppingTaskId(null);

      const pending = pendingInterruptPayloadRef.current;
      if (pending) {
        pendingInterruptPayloadRef.current = null;
        handleSubmitRef.current?.(pending);
      }
    }
  }, [isAgentRunning, stoppingTaskId, activeTaskId]);

  useEffect(() => {
    if (!stoppingTaskId || stoppingTaskId !== activeTaskId || !isAgentRunning) return;
    if (!pendingInterruptPayloadRef.current) return;

    const ABORT_TIMEOUT_MS = 15_000;
    const timer = setTimeout(() => {
      setStoppingTaskId(null);
      const pending = pendingInterruptPayloadRef.current;
      if (pending) {
        pendingInterruptPayloadRef.current = null;
        handleSubmitRef.current?.(pending);
      }
    }, ABORT_TIMEOUT_MS);

    return () => clearTimeout(timer);
  }, [stoppingTaskId, activeTaskId, isAgentRunning]);

  useEffect(() => {
    if (!lastControlAck || lastControlAck.accepted) return;
    if (lastControlAck.taskId === stoppingTaskId) {
      setStoppingTaskId(null);
      const pending = pendingInterruptPayloadRef.current;
      if (pending) {
        pendingInterruptPayloadRef.current = null;
        handleSubmitRef.current?.(pending);
      }
    }
  }, [lastControlAck, stoppingTaskId]);

  const [dismissedFailedTaskId, setDismissedFailedTaskId] = useState<string | null>(null);

  useEffect(() => {
    setDismissedFailedTaskId(null);
  }, [activeTaskId]);

  useEffect(() => {
    if (stoppingTaskId && stoppingTaskId !== activeTaskId) {
      setStoppingTaskId(null);
      pendingInterruptPayloadRef.current = null;
    }
  }, [activeTaskId, stoppingTaskId]);

  const showFailedCard = isAgentFailed && dismissedFailedTaskId !== activeTaskId;

  const isAgentRunningRef = useRef(false);
  isAgentRunningRef.current = isAgentRunning;

  /** Build a lookup from model IDs to human-readable labels using available models. */
  const modelLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of availableModels) {
      map.set(m.id, m.label);
    }
    return map;
  }, [availableModels]);

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: message building has inherent branching for Loro vs store, thinking indicators, and queued messages
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

    if (
      useLoro &&
      ((loroTask.conversation?.length ?? 0) > 0 || (loroTask.pendingFollowUps?.length ?? 0) > 0)
    ) {
      raw = loroTask.conversation.map((msg) => ({
        id: msg.messageId ?? crypto.randomUUID(),
        role: msg.role,
        content: msg.content,
        agentName: msg.role === 'assistant' ? resolveModelLabel(msg.model) : undefined,
      }));

      const status = loroTask.meta?.status;
      const isInFlight = status === 'submitted' || status === 'starting' || status === 'working';
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

      for (const pending of loroTask.pendingFollowUps) {
        raw.push({
          id: `queued-${pending.messageId}`,
          role: pending.role,
          content: pending.content,
          isQueued: true,
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
        !msg.isThinking &&
        !last.isQueued &&
        !msg.isQueued
      ) {
        last.content = [...last.content, ...msg.content];
      } else {
        grouped.push({ ...msg, content: [...msg.content] });
      }
    }
    return grouped;
  }, [
    loroTask.conversation,
    loroTask.pendingFollowUps,
    loroTask.meta?.status,
    storeMessages,
    modelLabelMap,
  ]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const demoTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const composerRef = useRef<ChatComposerHandle>(null);
  const terminalRef = useRef<TerminalPanelHandle>(null);
  const sidePanelRef = useRef<SidePanelHandle>(null);

  const selectedEnvironmentPath = useUIStore((s) => s.selectedEnvironmentPath);
  const setSelectedEnvironmentPath = useUIStore((s) => s.setSelectedEnvironmentPath);

  const [composerModel, setComposerModelLocal] = useState(
    () => crdtComposerModel ?? 'claude-opus-4-6'
  );
  const resolvedReasoning = toReasoningLevel(crdtComposerReasoning);
  const [composerReasoning, setComposerReasoningLocal] = useState<ReasoningLevel>(
    () => resolvedReasoning ?? 'medium'
  );
  const resolvedPermission = toPermissionMode(crdtComposerPermission);
  const [composerPermission, setComposerPermissionLocal] = useState<PermissionMode>(
    () => resolvedPermission ?? 'default'
  );

  useEffect(() => {
    if (crdtComposerModel) setComposerModelLocal(crdtComposerModel);
  }, [crdtComposerModel]);

  useEffect(() => {
    if (resolvedReasoning) setComposerReasoningLocal(resolvedReasoning);
  }, [resolvedReasoning]);

  useEffect(() => {
    if (resolvedPermission) setComposerPermissionLocal(resolvedPermission);
  }, [resolvedPermission]);

  const setComposerModel = useCallback(
    (modelId: string) => {
      setComposerModelLocal(modelId);
      change(roomTypedDoc, (draft) => {
        draft.userSettings.composerModel = modelId;
      });
    },
    [roomTypedDoc]
  );

  const setComposerReasoning = useCallback(
    (level: ReasoningLevel) => {
      setComposerReasoningLocal(level);
      change(roomTypedDoc, (draft) => {
        draft.userSettings.composerReasoning = level;
      });
    },
    [roomTypedDoc]
  );

  const setComposerPermission = useCallback(
    (mode: PermissionMode) => {
      setComposerPermissionLocal(mode);
      change(roomTypedDoc, (draft) => {
        draft.userSettings.composerPermission = mode;
      });
    },
    [roomTypedDoc]
  );

  const [isWorktreeModalOpen, setIsWorktreeModalOpen] = useState(false);
  const [worktreeProgress, setWorktreeProgress] = useState<{
    branchName: string;
    step: string;
    isComplete: boolean;
    isError: boolean;
    errorMessage?: string;
    warnings?: string[];
    worktreePath?: string;
    setupScriptStarted?: boolean;
    setupStatus?: 'running' | 'done' | 'failed';
    setupExitCode?: number | null;
    requestId?: string;
  } | null>(null);

  const { createWorktree, isCreating: isCreatingWorktree } = useCreateWorktree({
    roomHandle,
    machineId: selectedMachineId,
  });

  const worktreeScriptsRecord = useDoc(
    roomDocHandle,
    (d: { userSettings: { worktreeScripts: Record<string, WorktreeScriptValue> } }) =>
      d.userSettings.worktreeScripts
  );

  const worktreeScripts = useMemo(
    () => new Map(Object.entries(worktreeScriptsRecord ?? {})),
    [worktreeScriptsRecord]
  );

  /**
   * Subscribe to worktreeSetupResps ephemeral to receive setup script exit status.
   * When the daemon's child process exits, it writes { exitCode, signal, worktreePath }
   * keyed by the original requestId. We correlate with the active progress card.
   */
  useEffect(() => {
    const unsub = roomHandle.worktreeSetupResps.subscribe(({ key, value, source }) => {
      if (source === 'local') return;
      if (!value) return;
      setWorktreeProgress((prev) => {
        if (!prev || prev.requestId !== key) return prev;
        if (!prev.setupScriptStarted) return prev;
        const exitCode = value.exitCode;
        const isSuccess = exitCode === 0;
        return {
          ...prev,
          setupStatus: isSuccess ? 'done' : 'failed',
          setupExitCode: exitCode,
        };
      });
    });
    return unsub;
  }, [roomHandle]);

  /**
   * CRDT fallback: when the browser refreshed or missed the ephemeral, the
   * daemon's terminal status (done/failed) will be in the CRDT document.
   * Correlate by worktreePath and update the progress card accordingly.
   *
   * Only runs when the progress card is showing a setup-in-progress state
   * and the CRDT already has a terminal result for that worktree path.
   */
  useEffect(() => {
    if (!worktreeProgress?.worktreePath) return;
    if (!worktreeProgress.setupScriptStarted) return;
    if (worktreeProgress.setupStatus === 'done' || worktreeProgress.setupStatus === 'failed') {
      return;
    }

    const crdtEntry = worktreeSetupStatusRecord[worktreeProgress.worktreePath];
    if (!crdtEntry) return;
    if (crdtEntry.status === 'running') return;

    const isSuccess = crdtEntry.status === 'done';
    setWorktreeProgress((prev) => {
      if (!prev) return prev;
      if (prev.setupStatus === 'done' || prev.setupStatus === 'failed') return prev;
      return {
        ...prev,
        setupStatus: isSuccess ? 'done' : 'failed',
        setupExitCode: crdtEntry.exitCode,
      };
    });
  }, [
    worktreeProgress?.worktreePath,
    worktreeProgress?.setupScriptStarted,
    worktreeProgress?.setupStatus,
    worktreeSetupStatusRecord,
  ]);

  /**
   * Reconstruct the progress card from CRDT on mount.
   * When the page loads after a refresh and the CRDT has recent worktree
   * setup entries, show the card so the user sees the result.
   * Only runs once (mount-only) -- the live subscription handles updates.
   */
  const hasReconstructedProgressRef = useRef(false);
  useEffect(() => {
    if (hasReconstructedProgressRef.current) return;
    if (!worktreeSetupStatusRecord) return;
    if (worktreeProgress) return;

    const recent = findRecentSetupEntry(worktreeSetupStatusRecord);
    if (!recent) return;

    hasReconstructedProgressRef.current = true;

    const isRunning = recent.entry.status === 'running';
    setWorktreeProgress({
      branchName: extractBranchFromWorktreePath(recent.worktreePath),
      step: 'done',
      isComplete: true,
      isError: false,
      worktreePath: recent.worktreePath,
      setupScriptStarted: true,
      setupStatus: isRunning ? 'running' : recent.entry.status === 'done' ? 'done' : 'failed',
      setupExitCode: recent.entry.exitCode,
    });
  }, [worktreeSetupStatusRecord, worktreeProgress]);

  const seededTaskRef = useRef<string | null>(null);

  useEffect(() => {
    seedComposerState(activeTaskId, loroTask.lastUserConfig, {
      setModel: setComposerModel,
      setReasoning: setComposerReasoning,
      setPermission: setComposerPermission,
      setEnvironment: setSelectedEnvironmentPath,
      seededRef: seededTaskRef,
    });
  }, [
    activeTaskId,
    loroTask.lastUserConfig,
    setSelectedEnvironmentPath,
    setComposerModel,
    setComposerReasoning,
    setComposerPermission,
  ]);

  useEffect(() => {
    if (availableModels.length === 0) return;
    if (!availableModels.some((m) => m.id === composerModel)) {
      setComposerModelLocal(availableModels[0]?.id ?? 'claude-opus-4-6');
    }
  }, [availableModels, composerModel]);

  useEffect(() => {
    if (taskHasUserMessage) return;
    if (!homeDir) {
      const firstEnv = availableEnvironments[0]?.path ?? null;
      setSelectedEnvironmentPath(firstEnv);
    } else {
      setSelectedEnvironmentPath(null);
    }
  }, [
    selectedMachineId,
    availableEnvironments,
    homeDir,
    setSelectedEnvironmentPath,
    taskHasUserMessage,
  ]);

  useEffect(() => {
    return () => clearTimeout(demoTimerRef.current);
  }, []);

  useFocusTarget({
    id: 'terminal',
    ref: terminalRef,
    priority: FOCUS_PRIORITY.PANEL,
    active: isTerminalOpen,
  });

  useEffect(() => {
    if (activeSidePanel === 'diff') setDiffLastViewedAt(Date.now());
  }, [activeSidePanel, setDiffLastViewedAt]);

  useEffect(() => {
    if (activeSidePanel !== null && typeof window !== 'undefined' && window.innerWidth < 1280) {
      setSidebarExpanded(false);
    }
  }, [activeSidePanel, setSidebarExpanded]);

  const planAutoOpenedForTaskRef = useRef<string | null>(null);
  const sawEmptyPlansForTaskRef = useRef<string | null>(null);
  useEffect(() => {
    if (plans.length === 0) {
      sawEmptyPlansForTaskRef.current = activeTaskId;
    } else if (
      sawEmptyPlansForTaskRef.current === activeTaskId &&
      planAutoOpenedForTaskRef.current !== activeTaskId
    ) {
      planAutoOpenedForTaskRef.current = activeTaskId;
      useUIStore.getState().setActiveSidePanel('plan');
    }
  }, [activeTaskId, plans.length]);

  const isKeyboardNavRef = useRef(false);
  const { focusTarget, scheduleFocus, cancelPending } = useFocusHierarchy();

  useFocusTarget({
    id: 'composer',
    ref: composerRef,
    priority: FOCUS_PRIORITY.COMPOSER,
    active: !isTerminalOpen,
  });

  useEffect(() => {
    if (isKeyboardNavRef.current) {
      isKeyboardNavRef.current = false;
      if (!isTerminalOpen) {
        scheduleFocus('composer', AUTOFOCUS_DELAY_MS);
      }
    } else {
      cancelPending();
      if (!isTerminalOpen) {
        focusTarget('composer');
      }
    }
  }, [activeTaskId, isTerminalOpen, focusTarget, scheduleFocus, cancelPending]);

  const handleNewTask = useCallback(() => {
    setActiveTask(null);
  }, [setActiveTask]);

  const handleNavigateNextTask = useCallback(() => {
    const currentIndex = taskList.findIndex((t) => t.taskId === activeTaskId);
    const nextIndex = currentIndex + 1;
    const next = taskList[nextIndex];
    if (next) {
      isKeyboardNavRef.current = true;
      setActiveTask(next.taskId);
    }
  }, [taskList, activeTaskId, setActiveTask]);

  const handleNavigatePrevTask = useCallback(() => {
    const currentIndex = taskList.findIndex((t) => t.taskId === activeTaskId);
    const prevIndex = currentIndex - 1;
    const prev = taskList[prevIndex];
    if (prev) {
      isKeyboardNavRef.current = true;
      setActiveTask(prev.taskId);
    }
  }, [taskList, activeTaskId, setActiveTask]);

  const handleFocusComposer = useCallback(() => {
    focusTarget('composer');
  }, [focusTarget]);

  const voiceInput = useVoiceInput({
    onTranscript: useCallback((text: string, isFinal: boolean) => {
      if (isFinal) {
        composerRef.current?.insertText(text);
      }
    }, []),
  });

  const {
    enhance: enhancePromptFn,
    cancel: cancelEnhance,
    isEnhancing,
  } = useEnhancePrompt({
    roomHandle,
    machineId: selectedMachineId,
  });

  useEffect(() => {
    voiceInput.stop();
    cancelEnhance();
    // eslint-disable-next-line -- intentionally omit voiceInput.stop/cancelEnhance from deps; only re-run on task switch
  }, [activeTaskId]);

  const handleEnhance = useCallback(() => {
    if (isEnhancing) {
      cancelEnhance();
      return;
    }

    const text = composerRef.current?.getText()?.trim();
    if (!text) return;

    enhancePromptFn(text, {
      onChunk: (accumulated) => {
        composerRef.current?.streamText(accumulated);
      },
      onDone: (fullText) => {
        composerRef.current?.replaceText(fullText);
        focusTarget('composer');
      },
      onError: () => {
        focusTarget('composer');
      },
    });
  }, [isEnhancing, cancelEnhance, enhancePromptFn, focusTarget]);

  const [worktreeSourceRepo, setWorktreeSourceRepo] = useState<GitRepoInfo | null>(null);

  const handleWorktreeCreate = useCallback(
    (params: {
      sourceRepoPath: string;
      branchName: string;
      baseRef: string;
      setupScript: string | null;
    }) => {
      setWorktreeProgress({
        branchName: params.branchName,
        step: 'creating-worktree',
        isComplete: false,
        isError: false,
      });
      setIsWorktreeModalOpen(false);

      createWorktree(
        {
          sourceRepoPath: params.sourceRepoPath,
          branchName: params.branchName,
          baseRef: params.baseRef,
          setupScript: params.setupScript,
        },
        {
          onProgress: (progress) => {
            setWorktreeProgress((prev) => (prev ? { ...prev, step: progress.step } : null));
          },
          onDone: (result) => {
            setWorktreeProgress((prev) =>
              prev
                ? {
                    ...prev,
                    isComplete: true,
                    step: 'done',
                    worktreePath: result.worktreePath,
                    warnings: result.warnings,
                    setupScriptStarted: result.setupScriptStarted,
                    setupStatus: result.setupScriptStarted ? 'running' : undefined,
                    requestId: result.requestId,
                  }
                : null
            );
          },
          onError: (message) => {
            setWorktreeProgress((prev) =>
              prev
                ? {
                    ...prev,
                    isError: true,
                    errorMessage: message,
                  }
                : null
            );
          },
        }
      );
    },
    [createWorktree]
  );

  /** Open the worktree modal with a pre-selected source repo (from picker "+" button). */
  const handleOpenWorktreeModalWithSource = useCallback((sourceRepo: GitRepoInfo) => {
    setWorktreeSourceRepo(sourceRepo);
    setIsWorktreeModalOpen(true);
  }, []);

  /** Open the worktree modal without a pre-selected source (from slash command). */
  const handleOpenWorktreeModal = useCallback(() => {
    setWorktreeSourceRepo(null);
    setIsWorktreeModalOpen(true);
  }, []);

  const toggleSettings = useCallback(() => {
    if (useUIStore.getState().isSettingsOpen) {
      navigateFromSettings();
    } else {
      navigateToSettings();
    }
  }, []);

  const handleCloseSettings = useCallback(() => {
    navigateFromSettings();
  }, []);

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
    onToggleVoiceInput: voiceInput.toggle,
    onStopAgent: useCallback(() => {
      if (isAgentRunningRef.current) handleStopAgent();
    }, [handleStopAgent]),
  });

  const [showScrollButton, setShowScrollButton] = useState(false);

  const checkIfNearBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= SCROLL_THRESHOLD;
    isNearBottomRef.current = nearBottom;
    setShowScrollButton(!nearBottom);
  }, []);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (el) {
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
      isNearBottomRef.current = true;
      setShowScrollButton(false);
    }
  }, []);

  useEffect(() => {
    if (isNearBottomRef.current) {
      scrollToBottom();
    }
  }, [messages, scrollToBottom]);

  useEffect(() => {
    isNearBottomRef.current = true;
    scrollToBottom();
  }, [activeTaskId, scrollToBottom]);

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
        if (status && TERMINAL_TASK_STATES.includes(status)) return;
        connection.send({
          type: 'notify-task',
          requestId: crypto.randomUUID(),
          machineId: selectedMachineId,
          taskId: activeTaskId,
        });
      }
    });

    return unsub;
  }, [connection, activeTaskId, selectedMachineId]);

  const handleSubmit = useCallback(
    (payload: SubmitPayload) => {
      if (!selectedMachineId || connectionState !== 'connected') return;
      cancelEnhance();
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
        writeCrdtDocs(repo, {
          currentTaskId,
          message,
          payload,
          model,
          reasoningEffort,
          permissionMode,
          diffComments,
          planComments,
          deliveredCommentIds,
          selectedMachineId,
          selectedEnvironmentPath,
          homeDir,
          isAgentRunning: isAgentRunningRef.current,
        });
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
      cancelEnhance,
      connection,
      connectionState,
      selectedMachineId,
      selectedEnvironmentPath,
      homeDir,
      repo,
      diffComments,
      planComments,
      deliveredCommentIds,
    ]
  );

  handleSubmitRef.current = handleSubmit;

  const handleInterruptAndSend = useCallback(
    (payload: SubmitPayload) => {
      if (!connection || !activeTaskId || !selectedMachineId) return;
      pendingInterruptPayloadRef.current = payload;
      if (stoppingTaskId !== activeTaskId) {
        setStoppingTaskId(activeTaskId);
        connection.send({
          type: 'cancel-task',
          requestId: crypto.randomUUID(),
          machineId: selectedMachineId,
          taskId: activeTaskId,
        });
      }
    },
    [connection, activeTaskId, selectedMachineId, stoppingTaskId]
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

  const canSubmit =
    !!selectedMachineId &&
    connectionState === 'connected' &&
    machines.some((m) => m.machineId === selectedMachineId);
  const submitDisabledReason = getSubmitDisabledReason(canSubmit, connectionState);

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
      <div
        className="flex overflow-hidden bg-background"
        style={{ height: visualViewportHeight ? `${visualViewportHeight}px` : '100dvh' }}
      >
        <CommandPalette />
        <ShortcutsModal />
        <WorktreeCreationModal
          isOpen={isWorktreeModalOpen}
          onClose={() => setIsWorktreeModalOpen(false)}
          sourceRepo={worktreeSourceRepo}
          environments={availableEnvironments}
          onSubmit={handleWorktreeCreate}
          isCreating={isCreatingWorktree}
          worktreeScripts={worktreeScripts}
        />
        <Sidebar />
        <div className="flex flex-col flex-1 min-w-0 min-h-0" tabIndex={-1}>
          <TopBar
            onToggleTerminal={toggleTerminal}
            onToggleSidePanel={useCallback(() => toggleSidePanel('diff'), [toggleSidePanel])}
            hasUnviewedDiff={hasUnviewedDiff}
            totalCostUsd={totalCostUsd}
          />

          <main id="main-content" className="flex flex-col flex-1 min-h-0">
            {isSettingsOpen ? (
              <SettingsPage
                onBack={handleCloseSettings}
                availableEnvironments={availableEnvironments}
                machines={machines}
                capabilitiesByMachine={capsByMachine}
                roomHandle={roomHandle}
              />
            ) : (
              <>
                {hasMessages ? (
                  <div
                    ref={scrollRef}
                    onScroll={checkIfNearBottom}
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
                            .filter(
                              ([_toolUseId, request]) =>
                                request.toolName !== 'ExitPlanMode' &&
                                request.toolName !== 'AskUserQuestion'
                            )
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
                    {showScrollButton && (
                      <div className="sticky bottom-3 flex justify-center pointer-events-none">
                        <button
                          type="button"
                          aria-label="Scroll to latest messages"
                          className="pointer-events-auto flex items-center justify-center w-8 h-8 rounded-full bg-default-100 hover:bg-default-200 shadow-md transition-colors"
                          onClick={scrollToBottom}
                        >
                          <ChevronDown className="w-4 h-4 text-default-600" />
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <HeroState
                    environmentLabel={heroEnvironmentLabel}
                    canSubmit={canSubmit}
                    onSuggestionClick={(text) =>
                      handleSubmit({
                        message: text,
                        images: [],
                        model: composerModel,
                        reasoningEffort: composerReasoning,
                        permissionMode: composerPermission,
                      })
                    }
                  />
                )}

                <div className="shrink-0 w-full max-w-3xl mx-auto px-3 sm:px-4">
                  {worktreeProgress && (
                    <div className="mb-2">
                      <WorktreeProgressCard
                        branchName={worktreeProgress.branchName}
                        currentStep={worktreeProgress.step}
                        isComplete={worktreeProgress.isComplete}
                        isError={worktreeProgress.isError}
                        errorMessage={worktreeProgress.errorMessage}
                        warnings={worktreeProgress.warnings}
                        setupScriptStarted={worktreeProgress.setupScriptStarted}
                        setupStatus={worktreeProgress.setupStatus}
                        setupExitCode={worktreeProgress.setupExitCode}
                        onSwitchToWorktree={
                          worktreeProgress.worktreePath &&
                          !taskHasUserMessage &&
                          selectedEnvironmentPath !== worktreeProgress.worktreePath
                            ? () => {
                                const wtPath = worktreeProgress.worktreePath;
                                setSelectedEnvironmentPath(wtPath ?? null);
                                const isSetupTerminalOrAbsent =
                                  !worktreeProgress.setupScriptStarted ||
                                  worktreeProgress.setupStatus === 'done' ||
                                  worktreeProgress.setupStatus === 'failed';
                                if (isSetupTerminalOrAbsent) {
                                  if (wtPath) {
                                    change(roomTypedDoc, (draft) => {
                                      draft.worktreeSetupStatus.delete(wtPath);
                                    });
                                  }
                                  setWorktreeProgress(null);
                                }
                              }
                            : undefined
                        }
                        onDismiss={() => {
                          const wtPath = worktreeProgress.worktreePath;
                          if (wtPath) {
                            change(roomTypedDoc, (draft) => {
                              draft.worktreeSetupStatus.delete(wtPath);
                            });
                          }
                          setWorktreeProgress(null);
                        }}
                      />
                    </div>
                  )}
                  {isAgentRunning && (
                    <div className="mb-2">
                      <AgentStatusCard
                        status="running"
                        modelName={lastSubmittedModelRef.current ?? undefined}
                        onStop={handleStopAgent}
                        isStopping={isStopping}
                      />
                    </div>
                  )}
                  {showFailedCard && (
                    <div className="mb-2">
                      <AgentStatusCard
                        status="failed"
                        modelName={lastSubmittedModelRef.current ?? undefined}
                        errorMessage={
                          loroTask.sessions?.[loroTask.sessions.length - 1]?.error ?? undefined
                        }
                        onDismiss={() => setDismissedFailedTaskId(activeTaskId)}
                      />
                    </div>
                  )}
                  <ChatComposer
                    key={activeTaskId ?? 'new'}
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
                    isSubmitDisabled={!canSubmit}
                    submitDisabledReason={submitDisabledReason}
                    isVoiceRecording={voiceInput.isListening}
                    isVoiceSupported={voiceInput.isSupported}
                    onVoiceToggle={voiceInput.toggle}
                    voiceInterimText={voiceInput.interimText}
                    isEnhancing={isEnhancing}
                    onEnhance={handleEnhance}
                    onCreateWorktree={handleOpenWorktreeModal}
                    isEnvironmentLocked={taskHasUserMessage}
                    isAgentRunning={isAgentRunning}
                    onInterruptAndSend={handleInterruptAndSend}
                    onStopAgent={handleStopAgent}
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
                    onCreateWorktree={handleOpenWorktreeModalWithSource}
                    isMachineLocked={taskHasUserMessage}
                    isEnvironmentLocked={taskHasUserMessage}
                  />
                </div>
              </>
            )}
          </main>

          <TerminalPanel
            ref={terminalRef}
            isOpen={isTerminalOpen}
            onClose={() => useUIStore.getState().setTerminalOpen(false)}
            activeTaskId={activeTaskId}
            createTerminalChannel={createTerminalChannel}
            peerState={peerState}
            selectedEnvironmentPath={selectedEnvironmentPath}
          />
        </div>

        <FeedbackProvider
          onSubmit={handleSubmit}
          onInterruptAndSend={handleInterruptAndSend}
          isAgentRunning={isAgentRunning}
          composerModel={composerModel}
          composerReasoning={composerReasoning}
          composerPermission={composerPermission}
          markCommentsDelivered={markCommentsDelivered}
        >
          <SidePanel ref={sidePanelRef}>
            <div className={activeSidePanel === 'diff' ? 'contents' : 'hidden'}>
              <DiffPanelContent key={activeTaskId ?? 'new'} activeTaskId={activeTaskId} />
            </div>
            <div className={activeSidePanel === 'plan' ? 'contents' : 'hidden'}>
              <PlanPanelContent key={activeTaskId ?? 'new'} activeTaskId={activeTaskId} />
            </div>
          </SidePanel>
        </FeedbackProvider>
      </div>
    </PlanApprovalProvider>
  );
}
