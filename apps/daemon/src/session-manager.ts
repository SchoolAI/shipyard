import type {
  CanUseTool,
  PermissionMode,
  Query,
  SDKMessage,
  SDKUserMessage,
  SettingSource,
} from '@anthropic-ai/claude-agent-sdk';
import { query } from '@anthropic-ai/claude-agent-sdk';
import type { TypedDoc } from '@loro-extended/change';

type MessageParam = SDKUserMessage['message'];

import { change, getLoroDoc } from '@loro-extended/change';
import type {
  A2ATaskState,
  ContentBlock,
  SessionState,
  SupportedImageMediaType,
  TaskConversationDocumentShape,
  TaskDocHandles,
  TaskMetaDocumentShape,
  TaskReviewDocumentShape,
} from '@shipyard/loro-schema';
import { extractPlanMarkdown, SUPPORTED_IMAGE_MEDIA_TYPES } from '@shipyard/loro-schema';
import { nanoid } from 'nanoid';
import { logger } from './logger.js';
import { initPlanEditorDoc } from './plan-editor/index.js';
import { StreamingInputController } from './streaming-input-controller.js';

export const IDLE_TIMEOUT_MS = 5 * 60 * 1000;
export const IDLE_CHECK_INTERVAL_MS = 30_000;

/**
 * Convert Loro ContentBlock[] to the Anthropic SDK message content format.
 * Images are placed first with "Image N:" labels per Anthropic best practices,
 * followed by all text blocks. Handles mediaType -> media_type conversion.
 */
const SAFE_MEDIA_TYPES: ReadonlySet<string> = new Set(SUPPORTED_IMAGE_MEDIA_TYPES);

function isSafeMediaType(value: string): value is SupportedImageMediaType {
  return SAFE_MEDIA_TYPES.has(value);
}

function toSdkContent(blocks: ContentBlock[]): MessageParam['content'] {
  const imageBlocks: Array<ContentBlock & { type: 'image' }> = [];
  const textBlocks: Array<ContentBlock & { type: 'text' }> = [];

  for (const block of blocks) {
    if (block.type === 'image') imageBlocks.push(block);
    else if (block.type === 'text') textBlocks.push(block);
  }

  const result: MessageParam['content'] = [];

  for (let i = 0; i < imageBlocks.length; i++) {
    const img = imageBlocks[i];
    if (!img) continue;
    if (img.source.type !== 'base64') {
      logger.warn({ sourceType: img.source.type }, 'Skipping image with unsupported source type');
      continue;
    }
    if (!isSafeMediaType(img.source.mediaType)) {
      logger.warn(
        { mediaType: img.source.mediaType },
        'Skipping image with unsupported media type'
      );
      continue;
    }
    result.push({ type: 'text' as const, text: `Attachment ${i + 1}:` });
    result.push({
      type: 'image' as const,
      source: {
        type: 'base64' as const,
        media_type: img.source.mediaType,
        data: img.source.data,
      },
    });
  }

  for (const block of textBlocks) {
    result.push({ type: 'text' as const, text: block.text });
  }

  return result;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return '{}';
  }
}

const SHIPYARD_SYSTEM_PROMPT_APPEND = `
# Shipyard Permission System

You are running inside Shipyard, a collaborative workspace with a built-in permission system.

CRITICAL: Never ask the user conversationally for permission to perform an action. Always attempt the tool call directly. The permission system will prompt the user for approval automatically when needed. If a tool call is denied, you will receive the denial as a tool result — do not preemptively refuse or ask "should I proceed?" for file operations, bash commands, or any other tool use. Just call the tool.
`;

function parseToolResultBlock(
  block: Record<string, unknown>,
  parentToolUseId: string | null
): ContentBlock | null {
  if (typeof block.tool_use_id !== 'string') return null;
  const resultContent =
    typeof block.content === 'string' ? block.content : JSON.stringify(block.content ?? '');
  return {
    type: 'tool_result',
    toolUseId: block.tool_use_id,
    content: resultContent,
    isError: typeof block.is_error === 'boolean' ? block.is_error : false,
    parentToolUseId,
  };
}

function parseToolUseBlock(
  block: Record<string, unknown>,
  parentToolUseId: string | null
): ContentBlock | null {
  if (typeof block.id !== 'string' || typeof block.name !== 'string') return null;
  return {
    type: 'tool_use',
    toolUseId: block.id,
    toolName: block.name,
    input: safeStringify(block.input ?? {}),
    parentToolUseId,
  };
}

/**
 * Parse a single SDK content block (untyped record) into a typed ContentBlock.
 * Returns null for unrecognized or invalid block types (server_tool_use, redacted_thinking, etc.)
 */
function parseSdkBlock(
  block: Record<string, unknown>,
  parentToolUseId: string | null
): ContentBlock | null {
  switch (block.type) {
    case 'text':
      return typeof block.text === 'string' ? { type: 'text', text: block.text } : null;
    case 'tool_use':
      return parseToolUseBlock(block, parentToolUseId);
    case 'tool_result':
      return parseToolResultBlock(block, parentToolUseId);
    case 'thinking':
      return typeof block.thinking === 'string' ? { type: 'thinking', text: block.thinking } : null;
    case 'image': {
      // eslint-disable-next-line no-restricted-syntax -- SDK block.source is untyped Record
      const source = block.source as Record<string, unknown> | undefined;
      if (
        source &&
        source.type === 'base64' &&
        typeof source.media_type === 'string' &&
        typeof source.data === 'string'
      ) {
        return {
          type: 'image',
          id: typeof block.id === 'string' ? block.id : nanoid(),
          source: { type: 'base64', mediaType: source.media_type, data: source.data },
        };
      }
      return null;
    }
    default:
      return null;
  }
}

export interface CreateSessionOptions {
  prompt: string | ContentBlock[];
  cwd: string;
  machineId?: string;
  model?: string;
  effort?: 'low' | 'medium' | 'high';
  allowedTools?: string[];
  permissionMode?: PermissionMode;
  maxTurns?: number;
  abortController?: AbortController;
  allowDangerouslySkipPermissions?: boolean;
  settingSources?: SettingSource[];
  systemPrompt?: string | { type: 'preset'; preset: 'claude_code'; append?: string };
  canUseTool?: CanUseTool;
  stderr?: (data: string) => void;
}

export interface SessionResult {
  sessionId: string;
  agentSessionId: string;
  status: SessionState;
  resultText?: string;
  totalCostUsd?: number;
  durationMs?: number;
  error?: string;
}

/**
 * Manages Claude Code sessions via the Agent SDK, syncing all state
 * transitions and conversation messages to a Loro CRDT task document.
 *
 * V1 streaming mode: keeps the subprocess alive between turns by using
 * an AsyncGenerator prompt. New user messages are pushed via sendFollowUp()
 * instead of spawning a new query() subprocess.
 *
 * Session lifecycle: pending -> active -> completed | failed
 * Task status mirrors: submitted -> working -> completed | failed
 */
const FAST_MODEL_ID = 'claude-opus-4-6-fast';
const FAST_MODEL_REAL = 'claude-opus-4-6';
const FAST_MODE_EXTRA_ARGS = { settings: '{"fastMode":true}' };

function resolveModel(model: string | undefined): {
  model: string | undefined;
  extraArgs?: Record<string, string | null>;
} {
  if (model === FAST_MODEL_ID) {
    return { model: FAST_MODEL_REAL, extraArgs: FAST_MODE_EXTRA_ARGS };
  }
  return { model };
}

export type StatusChangeCallback = (status: A2ATaskState) => void;

export class SessionManager {
  readonly #metaDoc: TypedDoc<TaskMetaDocumentShape>;
  readonly #convDoc: TypedDoc<TaskConversationDocumentShape>;
  readonly #reviewDoc: TypedDoc<TaskReviewDocumentShape>;
  readonly #onStatusChange: StatusChangeCallback | undefined;
  #currentModel: string | null = null;
  #machineId: string | null = null;
  #inputController: StreamingInputController | null = null;
  #activeQuery: Query | null = null;

  constructor(taskDocs: TaskDocHandles, onStatusChange?: StatusChangeCallback) {
    this.#metaDoc = taskDocs.meta;
    this.#convDoc = taskDocs.conv;
    this.#reviewDoc = taskDocs.review;
    this.#onStatusChange = onStatusChange;
  }

  get isStreaming(): boolean {
    return this.#inputController !== null && !this.#inputController.isDone;
  }

  #notifyStatusChange(status: A2ATaskState): void {
    this.#onStatusChange?.(status);
  }

  /**
   * Extract the latest user message text from the conversation.
   * Walks backwards from the end to find the most recent user turn,
   * then concatenates all text parts.
   *
   * Returns null if no user message exists.
   */
  getLatestUserPrompt(): string | null {
    const conversation = this.#convDoc.toJSON().conversation;
    for (let i = conversation.length - 1; i >= 0; i--) {
      const msg = conversation[i];
      if (msg?.role === 'user') {
        return msg.content
          .filter((block): block is ContentBlock & { type: 'text' } => block.type === 'text')
          .map((block) => block.text)
          .join('\n');
      }
    }
    return null;
  }

  /**
   * Extract the latest user message as content blocks (text + image).
   * Used when sending messages to Claude so images are included.
   * Filters out tool_use/tool_result/thinking blocks that aren't
   * relevant when constructing a new prompt.
   */
  getLatestUserContentBlocks(): ContentBlock[] | null {
    const conversation = this.#convDoc.toJSON().conversation;
    for (let i = conversation.length - 1; i >= 0; i--) {
      const msg = conversation[i];
      if (msg?.role === 'user') {
        return msg.content.filter(
          (block): block is ContentBlock & { type: 'text' | 'image' } =>
            block.type === 'text' || block.type === 'image'
        );
      }
    }
    return null;
  }

  /**
   * Determine whether to resume an existing session or start fresh.
   *
   * Walks backwards through sessions to find the most recent one with a
   * non-empty agentSessionId that has not genuinely failed. Interrupted
   * (user-cancelled) sessions are resumable. If found, returns
   * { resume: true, sessionId } so the caller can pass it to resumeSession().
   */
  shouldResume(): { resume: boolean; sessionId?: string } {
    const sessions = this.#convDoc.toJSON().sessions;
    if (sessions.length === 0) return { resume: false };

    for (let i = sessions.length - 1; i >= 0; i--) {
      const session = sessions[i];
      if (session?.agentSessionId && session.status !== 'failed') {
        return { resume: true, sessionId: session.sessionId };
      }
    }
    return { resume: false };
  }

  /**
   * Create a new Claude Code session using streaming input mode.
   *
   * 1. Creates a StreamingInputController and pushes the first message
   * 2. Calls query() with the controller's async iterable as prompt
   * 3. Stores the Query and controller for follow-up messages
   * 4. Processes messages until the session fully ends
   * 5. Returns the final SessionResult
   */
  async createSession(opts: CreateSessionOptions): Promise<SessionResult> {
    this.#currentModel = opts.model ?? null;
    this.#machineId = opts.machineId ?? null;
    const resolved = resolveModel(opts.model);
    const sessionId = nanoid();
    const now = Date.now();

    change(this.#convDoc, (draft) => {
      draft.sessions.push({
        sessionId,
        agentSessionId: '',
        status: 'pending',
        cwd: opts.cwd,
        model: opts.model ?? null,
        machineId: opts.machineId ?? null,
        createdAt: now,
        completedAt: null,
        totalCostUsd: null,
        durationMs: null,
        error: null,
      });
    });
    change(this.#metaDoc, (draft) => {
      draft.meta.status = 'starting';
      draft.meta.updatedAt = now;
    });
    this.#notifyStatusChange('starting');

    const controller = new StreamingInputController();
    controller.push(typeof opts.prompt === 'string' ? opts.prompt : toSdkContent(opts.prompt));

    const response: Query = query({
      prompt: controller.iterable(),
      options: {
        cwd: opts.cwd,
        model: resolved.model,
        effort: opts.effort,
        allowedTools: opts.allowedTools,
        permissionMode: opts.permissionMode,
        maxTurns: opts.maxTurns,
        abortController: opts.abortController,
        allowDangerouslySkipPermissions: opts.allowDangerouslySkipPermissions,
        settingSources: opts.settingSources ?? ['project'],
        systemPrompt: opts.systemPrompt ?? {
          type: 'preset',
          preset: 'claude_code',
          append: SHIPYARD_SYSTEM_PROMPT_APPEND,
        },
        canUseTool: opts.canUseTool,
        stderr: opts.stderr,
        extraArgs: resolved.extraArgs,
      },
    });

    this.#inputController = controller;
    this.#activeQuery = response;

    return this.#processMessages(response, sessionId, opts.abortController);
  }

  /**
   * Send a follow-up message to the active streaming session.
   * The controller feeds the message to the generator, which wakes the
   * agent subprocess for the next turn without a cold start.
   */
  sendFollowUp(prompt: string | ContentBlock[]): void {
    if (!this.#inputController || this.#inputController.isDone) {
      throw new Error('No active streaming session to send follow-up to');
    }
    this.#inputController.push(typeof prompt === 'string' ? prompt : toSdkContent(prompt));

    change(this.#metaDoc, (draft) => {
      draft.meta.status = 'working';
      draft.meta.updatedAt = Date.now();
    });
    this.#notifyStatusChange('working');
  }

  /**
   * Gracefully close the active streaming session.
   * Ends the input generator and closes the query subprocess.
   */
  closeSession(): void {
    this.#inputController?.end();
    this.#activeQuery?.close();
    this.#inputController = null;
    this.#activeQuery = null;
  }

  /**
   * Change the model used by the active streaming session between turns.
   */
  async setModel(model: string): Promise<void> {
    const resolved = resolveModel(model);
    if (resolved.extraArgs) {
      /** NOTE: extraArgs can only be set at session creation — SDK's setModel() only accepts a string */
      logger.warn(
        { model, resolvedModel: resolved.model },
        'Fast mode requires a new session — switching model only, extraArgs ignored'
      );
    }
    await this.#activeQuery?.setModel(resolved.model ?? model);
    this.#currentModel = model;
  }

  async setPermissionMode(mode: PermissionMode): Promise<void> {
    await this.#activeQuery?.setPermissionMode(mode);
  }

  /**
   * Resume an existing Claude Code session using streaming input mode.
   * Looks up the agentSessionId from the task doc and passes it as `resume`.
   */
  async resumeSession(
    sessionId: string,
    prompt: string | ContentBlock[],
    opts?: {
      abortController?: AbortController;
      machineId?: string;
      model?: string;
      effort?: 'low' | 'medium' | 'high';
      allowedTools?: string[];
      permissionMode?: PermissionMode;
      maxTurns?: number;
      allowDangerouslySkipPermissions?: boolean;
      canUseTool?: CanUseTool;
      stderr?: (data: string) => void;
    }
  ): Promise<SessionResult> {
    const sessions = this.#convDoc.toJSON().sessions;
    const sessionEntry = sessions.find((s) => s.sessionId === sessionId);
    if (!sessionEntry) {
      throw new Error(`Session ${sessionId} not found in task doc`);
    }

    if (!sessionEntry.agentSessionId) {
      throw new Error(`Session ${sessionId} has no agentSessionId`);
    }

    this.#currentModel = opts?.model ?? sessionEntry.model ?? null;
    this.#machineId = opts?.machineId ?? sessionEntry.machineId ?? null;
    const resolved = resolveModel(opts?.model ?? sessionEntry.model ?? undefined);
    const newSessionId = nanoid();
    const now = Date.now();

    change(this.#convDoc, (draft) => {
      draft.sessions.push({
        sessionId: newSessionId,
        agentSessionId: sessionEntry.agentSessionId,
        status: 'pending',
        cwd: sessionEntry.cwd,
        model: opts?.model ?? sessionEntry.model,
        machineId: opts?.machineId ?? sessionEntry.machineId,
        createdAt: now,
        completedAt: null,
        totalCostUsd: null,
        durationMs: null,
        error: null,
      });
    });
    change(this.#metaDoc, (draft) => {
      draft.meta.status = 'starting';
      draft.meta.updatedAt = now;
    });
    this.#notifyStatusChange('starting');

    const controller = new StreamingInputController();
    controller.push(typeof prompt === 'string' ? prompt : toSdkContent(prompt));

    const response: Query = query({
      prompt: controller.iterable(),
      options: {
        resume: sessionEntry.agentSessionId,
        cwd: sessionEntry.cwd,
        model: resolved.model,
        effort: opts?.effort,
        allowedTools: opts?.allowedTools,
        permissionMode: opts?.permissionMode,
        maxTurns: opts?.maxTurns,
        abortController: opts?.abortController,
        allowDangerouslySkipPermissions: opts?.allowDangerouslySkipPermissions,
        canUseTool: opts?.canUseTool,
        stderr: opts?.stderr,
        settingSources: ['project'],
        systemPrompt: {
          type: 'preset',
          preset: 'claude_code',
          append: SHIPYARD_SYSTEM_PROMPT_APPEND,
        },
        extraArgs: resolved.extraArgs,
      },
    });

    this.#inputController = controller;
    this.#activeQuery = response;

    return this.#processMessages(response, newSessionId, opts?.abortController);
  }

  async #processMessages(
    response: Query,
    sessionId: string,
    abortController?: AbortController
  ): Promise<SessionResult> {
    let agentSessionId = '';
    let lastMessageAt = Date.now();
    let idleTimedOut = false;

    const idleTimer = setInterval(() => {
      if (Date.now() - lastMessageAt >= IDLE_TIMEOUT_MS) {
        clearInterval(idleTimer);
        idleTimedOut = true;
        logger.warn(
          { sessionId, idleMs: Date.now() - lastMessageAt },
          'Session idle timeout, closing'
        );
        response.close();
      }
    }, IDLE_CHECK_INTERVAL_MS);

    try {
      for await (const message of response) {
        lastMessageAt = Date.now();
        const result = this.#handleMessage(message, sessionId, agentSessionId);
        if (result.agentSessionId) {
          agentSessionId = result.agentSessionId;
        }
        if (result.sessionResult) {
          return result.sessionResult;
        }
      }
    } catch (error: unknown) {
      return this.#handleProcessError(
        error,
        sessionId,
        agentSessionId,
        idleTimedOut,
        abortController
      );
    } finally {
      clearInterval(idleTimer);
      this.#inputController = null;
      this.#activeQuery = null;
    }

    const errorMsg = idleTimedOut
      ? 'Session idle timeout exceeded'
      : 'Session ended without result message';

    this.#markFailed(sessionId, errorMsg);
    return {
      sessionId,
      agentSessionId,
      status: 'failed',
      error: errorMsg,
    };
  }

  /**
   * Find the current index of a session by its sessionId.
   * This is looked up at mutation time to avoid stale indices from
   * concurrent CRDT syncs that may shift list positions.
   */
  #findSessionIndex(sessionId: string): number {
    const sessions = this.#convDoc.toJSON().sessions;
    return sessions.findIndex((s) => s.sessionId === sessionId);
  }

  #handleMessage(
    message: SDKMessage,
    sessionId: string,
    agentSessionId: string
  ): { agentSessionId?: string; sessionResult?: SessionResult } {
    switch (message.type) {
      case 'system':
        return this.#handleSystemMessage(message, sessionId);
      case 'assistant':
        return this.#handleAssistantMsg(message, sessionId);
      case 'user':
        if (!('isReplay' in message && message.isReplay)) {
          this.#appendUserToolResults(message);
        }
        return {};
      case 'result':
        return { sessionResult: this.#handleResult(message, sessionId, agentSessionId) };
      case 'tool_progress':
        this.#handleToolProgress(message);
        return {};
      default:
        return {};
    }
  }

  /** NOTE: Preserves synthetic model ID when init reports the underlying real model */
  #updateModelFromInit(reportedModel: string): void {
    const isFastAlias = this.#currentModel === FAST_MODEL_ID && reportedModel === FAST_MODEL_REAL;
    if (!isFastAlias) {
      this.#currentModel = reportedModel;
    }
  }

  #handleSystemMessage(
    message: SDKMessage & { type: 'system' },
    sessionId: string
  ): { agentSessionId?: string } {
    if ('subtype' in message && message.subtype === 'init') {
      const initSessionId = message.session_id;
      if ('model' in message && typeof message.model === 'string') {
        this.#updateModelFromInit(message.model);
      }
      const idx = this.#findSessionIndex(sessionId);
      change(this.#convDoc, (draft) => {
        const session = idx >= 0 ? draft.sessions.get(idx) : undefined;
        if (session) {
          session.agentSessionId = initSessionId;
          session.status = 'active';
        }
      });
      change(this.#metaDoc, (draft) => {
        draft.meta.status = 'working';
        draft.meta.updatedAt = Date.now();
      });
      this.#notifyStatusChange('working');
      return { agentSessionId: initSessionId };
    }

    if ('subtype' in message && message.subtype === 'task_notification') {
      const taskId = 'task_id' in message ? message.task_id : 'unknown';
      const status = 'status' in message ? message.status : 'unknown';
      const summary = 'summary' in message ? message.summary : '';
      logger.info({ taskId, status, summary }, 'Received task_notification from subagent');
    }

    return {};
  }

  #handleAssistantMsg(
    message: SDKMessage & { type: 'assistant' },
    sessionId: string
  ): Record<string, never> {
    if ('error' in message && message.error) {
      logger.warn({ error: message.error, sessionId }, 'Assistant message carried an error');
    }
    this.#appendAssistantMessage(message);
    return {};
  }

  #handleToolProgress(message: SDKMessage & { type: 'tool_progress' }): void {
    const toolName = 'tool_name' in message ? message.tool_name : 'unknown';
    const toolUseId = 'tool_use_id' in message ? message.tool_use_id : 'unknown';
    const elapsedSeconds = 'elapsed_time_seconds' in message ? message.elapsed_time_seconds : 0;
    logger.debug({ toolName, toolUseId, elapsedSeconds }, 'tool_progress heartbeat');
  }

  /**
   * Extract tool_result blocks from SDK user messages (which carry tool outputs)
   * and append them to the last assistant conversation entry so the UI can
   * display tool completion status alongside the tool_use that triggered them.
   */
  #appendUserToolResults(message: SDKMessage & { type: 'user' }): void {
    const rawContent = message.message.content;
    if (!Array.isArray(rawContent)) return;

    const rawParent = 'parent_tool_use_id' in message ? message.parent_tool_use_id : null;
    const parentToolUseId = typeof rawParent === 'string' ? rawParent : null;

    // eslint-disable-next-line no-restricted-syntax -- SDK content blocks typed as unknown[], need narrowing
    const sdkBlocks = rawContent as Array<Record<string, unknown>>;
    const toolResultBlocks: ContentBlock[] = [];
    for (const block of sdkBlocks) {
      if (block.type === 'tool_result') {
        const parsed = parseSdkBlock(block, parentToolUseId);
        if (parsed) toolResultBlocks.push(parsed);
      }
    }

    if (toolResultBlocks.length === 0) return;

    const conversation = this.#convDoc.toJSON().conversation;
    const lastMsg = conversation[conversation.length - 1];

    if (lastMsg && lastMsg.role === 'assistant') {
      const lastIdx = conversation.length - 1;
      change(this.#convDoc, (draft) => {
        for (const block of toolResultBlocks) {
          draft.conversation.get(lastIdx)?.content.push(block);
        }
      });
    } else {
      /** NOTE: No preceding assistant message -- store as a standalone assistant entry */
      change(this.#convDoc, (draft) => {
        draft.conversation.push({
          messageId: nanoid(),
          role: 'assistant',
          content: toolResultBlocks,
          timestamp: Date.now(),
          model: this.#currentModel,
          machineId: this.#machineId,
          reasoningEffort: null,
          permissionMode: null,
          cwd: null,
        });
      });
    }
    change(this.#metaDoc, (draft) => {
      draft.meta.updatedAt = Date.now();
    });
  }

  #appendAssistantMessage(message: SDKMessage & { type: 'assistant' }): void {
    const rawContent = message.message.content;
    if (!Array.isArray(rawContent)) return;

    const rawParent = 'parent_tool_use_id' in message ? message.parent_tool_use_id : null;
    const parentToolUseId = typeof rawParent === 'string' ? rawParent : null;

    // eslint-disable-next-line no-restricted-syntax -- SDK content blocks typed as unknown[], need narrowing
    const sdkBlocks = rawContent as Array<Record<string, unknown>>;
    const contentBlocks: ContentBlock[] = [];
    for (const block of sdkBlocks) {
      const parsed = parseSdkBlock(block, parentToolUseId);
      if (parsed) contentBlocks.push(parsed);
    }

    if (contentBlocks.length === 0) return;

    change(this.#convDoc, (draft) => {
      draft.conversation.push({
        messageId: nanoid(),
        role: 'assistant',
        content: contentBlocks,
        timestamp: Date.now(),
        model: this.#currentModel,
        machineId: this.#machineId,
        reasoningEffort: null,
        permissionMode: null,
        cwd: null,
      });
    });
    change(this.#metaDoc, (draft) => {
      draft.meta.updatedAt = Date.now();
    });

    this.#extractPlansFromBlocks(contentBlocks);
  }

  /**
   * Detect ExitPlanMode tool calls in content blocks and append plan versions
   * to the task document's plans list.
   */
  #extractPlansFromBlocks(blocks: ContentBlock[]): void {
    for (const block of blocks) {
      if (block.type !== 'tool_use' || block.toolName !== 'ExitPlanMode') continue;

      const planMarkdown = extractPlanMarkdown(block.input);
      if (!planMarkdown) {
        logger.warn(
          { toolUseId: block.toolUseId },
          'Failed to parse ExitPlanMode tool input as JSON'
        );
        continue;
      }

      const existingPlans = this.#reviewDoc.toJSON().plans;
      if (existingPlans.some((p) => p.toolUseId === block.toolUseId)) {
        logger.debug(
          { toolUseId: block.toolUseId },
          'Plan already exists in CRDT, skipping duplicate'
        );
        continue;
      }

      const planId = nanoid();

      change(this.#reviewDoc, (draft) => {
        draft.plans.push({
          planId,
          toolUseId: block.toolUseId,
          markdown: planMarkdown,
          reviewStatus: 'pending',
          reviewFeedback: null,
          createdAt: Date.now(),
        });
      });

      const loroDoc = getLoroDoc(this.#reviewDoc);
      const initOk = initPlanEditorDoc(loroDoc, planId, planMarkdown);
      if (!initOk) {
        logger.warn(
          { planId, toolUseId: block.toolUseId },
          'Failed to initialize plan editor doc from markdown'
        );
      }

      logger.info(
        { toolUseId: block.toolUseId, planId },
        'Extracted plan from ExitPlanMode tool call'
      );
    }
  }

  #handleResult(
    message: SDKMessage & { type: 'result' },
    sessionId: string,
    agentSessionId: string
  ): SessionResult {
    const isSuccess = message.subtype === 'success';
    const completedAt = Date.now();

    const errorText =
      !isSuccess &&
      'errors' in message &&
      Array.isArray(message.errors) &&
      message.errors.length > 0
        ? message.errors.join('; ')
        : null;

    const idx = this.#findSessionIndex(sessionId);
    const taskStatus: A2ATaskState = isSuccess ? 'completed' : 'failed';
    change(this.#convDoc, (draft) => {
      const session = idx >= 0 ? draft.sessions.get(idx) : undefined;
      if (session) {
        session.status = isSuccess ? 'completed' : 'failed';
        session.completedAt = completedAt;
        session.totalCostUsd = message.total_cost_usd ?? null;
        session.durationMs = message.duration_ms ?? null;
        if (!isSuccess) {
          session.error = errorText ?? `Agent SDK error: ${message.subtype}`;
        }
      }
    });
    change(this.#metaDoc, (draft) => {
      draft.meta.status = taskStatus;
      draft.meta.updatedAt = completedAt;
    });
    this.#notifyStatusChange(taskStatus);

    const resultText =
      'result' in message && typeof message.result === 'string' ? message.result : undefined;

    return {
      sessionId,
      agentSessionId,
      status: isSuccess ? 'completed' : 'failed',
      resultText,
      totalCostUsd: message.total_cost_usd,
      durationMs: message.duration_ms,
      error: !isSuccess ? (errorText ?? message.subtype) : undefined,
    };
  }

  #handleProcessError(
    error: unknown,
    sessionId: string,
    agentSessionId: string,
    idleTimedOut: boolean,
    abortController?: AbortController
  ): SessionResult {
    if (abortController?.signal.aborted) {
      this.#markInterrupted(sessionId);
      return { sessionId, agentSessionId, status: 'interrupted' };
    }

    const errorMsg = idleTimedOut
      ? 'Session idle timeout exceeded'
      : error instanceof Error
        ? error.message
        : String(error);
    this.#markFailed(sessionId, errorMsg);
    return { sessionId, agentSessionId, status: 'failed', error: errorMsg };
  }

  #markInterrupted(sessionId: string): void {
    const idx = this.#findSessionIndex(sessionId);
    change(this.#convDoc, (draft) => {
      const session = idx >= 0 ? draft.sessions.get(idx) : undefined;
      if (session) {
        session.status = 'interrupted';
        session.completedAt = Date.now();
      }
    });
    change(this.#metaDoc, (draft) => {
      draft.meta.status = 'canceled';
      draft.meta.updatedAt = Date.now();
    });
    this.#notifyStatusChange('canceled');
  }

  #markFailed(sessionId: string, errorMsg: string): void {
    const idx = this.#findSessionIndex(sessionId);
    change(this.#convDoc, (draft) => {
      const session = idx >= 0 ? draft.sessions.get(idx) : undefined;
      if (session) {
        session.status = 'failed';
        session.completedAt = Date.now();
        session.error = errorMsg;
      }
    });
    change(this.#metaDoc, (draft) => {
      draft.meta.status = 'failed';
      draft.meta.updatedAt = Date.now();
    });
    this.#notifyStatusChange('failed');
  }
}
