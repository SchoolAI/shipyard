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

import { change, loro } from '@loro-extended/change';
import type {
  A2ATaskState,
  ContentBlock,
  SessionState,
  SupportedImageMediaType,
  TaskDocumentShape,
} from '@shipyard/loro-schema';
import { extractPlanMarkdown, SUPPORTED_IMAGE_MEDIA_TYPES } from '@shipyard/loro-schema';
import { nanoid } from 'nanoid';
import { logger } from './logger.js';
import { initPlanEditorDoc } from './plan-editor/index.js';
import { StreamingInputController } from './streaming-input-controller.js';

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
export type StatusChangeCallback = (status: A2ATaskState) => void;

export class SessionManager {
  readonly #taskDoc: TypedDoc<TaskDocumentShape>;
  readonly #onStatusChange: StatusChangeCallback | undefined;
  #currentModel: string | null = null;
  #machineId: string | null = null;
  #inputController: StreamingInputController | null = null;
  #activeQuery: Query | null = null;

  constructor(taskDoc: TypedDoc<TaskDocumentShape>, onStatusChange?: StatusChangeCallback) {
    this.#taskDoc = taskDoc;
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
    const conversation = this.#taskDoc.toJSON().conversation;
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
    const conversation = this.#taskDoc.toJSON().conversation;
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
   * non-empty agentSessionId that has not failed. If found, returns
   * { resume: true, sessionId } so the caller can pass it to resumeSession().
   */
  shouldResume(): { resume: boolean; sessionId?: string } {
    const sessions = this.#taskDoc.toJSON().sessions;
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
    const sessionId = nanoid();
    const now = Date.now();

    change(this.#taskDoc, (draft) => {
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
        model: opts.model,
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
      },
    });

    this.#inputController = controller;
    this.#activeQuery = response;

    return this.#processMessages(response, sessionId);
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

    change(this.#taskDoc, (draft) => {
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
    await this.#activeQuery?.setModel(model);
    this.#currentModel = model;
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
    const sessions = this.#taskDoc.toJSON().sessions;
    const sessionEntry = sessions.find((s) => s.sessionId === sessionId);
    if (!sessionEntry) {
      throw new Error(`Session ${sessionId} not found in task doc`);
    }

    if (!sessionEntry.agentSessionId) {
      throw new Error(`Session ${sessionId} has no agentSessionId`);
    }

    this.#currentModel = opts?.model ?? sessionEntry.model ?? null;
    this.#machineId = opts?.machineId ?? sessionEntry.machineId ?? null;
    const newSessionId = nanoid();
    const now = Date.now();

    change(this.#taskDoc, (draft) => {
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
        model: opts?.model,
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
      },
    });

    this.#inputController = controller;
    this.#activeQuery = response;

    return this.#processMessages(response, newSessionId);
  }

  async #processMessages(response: Query, sessionId: string): Promise<SessionResult> {
    let agentSessionId = '';

    try {
      for await (const message of response) {
        const result = this.#handleMessage(message, sessionId, agentSessionId);
        if (result.agentSessionId) {
          agentSessionId = result.agentSessionId;
        }
        if (result.sessionResult) {
          return result.sessionResult;
        }
      }
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.#markFailed(sessionId, errorMsg);

      return {
        sessionId,
        agentSessionId,
        status: 'failed',
        error: errorMsg,
      };
    } finally {
      this.#inputController = null;
      this.#activeQuery = null;
    }

    this.#markFailed(sessionId, 'Session ended without result message');
    return {
      sessionId,
      agentSessionId,
      status: 'failed',
      error: 'Session ended without result message',
    };
  }

  /**
   * Find the current index of a session by its sessionId.
   * This is looked up at mutation time to avoid stale indices from
   * concurrent CRDT syncs that may shift list positions.
   */
  #findSessionIndex(sessionId: string): number {
    const sessions = this.#taskDoc.toJSON().sessions;
    return sessions.findIndex((s) => s.sessionId === sessionId);
  }

  #handleMessage(
    message: SDKMessage,
    sessionId: string,
    agentSessionId: string
  ): { agentSessionId?: string; sessionResult?: SessionResult } {
    if (message.type === 'system' && 'subtype' in message && message.subtype === 'init') {
      const initSessionId = message.session_id;
      if ('model' in message && typeof message.model === 'string') {
        this.#currentModel = message.model;
      }
      const idx = this.#findSessionIndex(sessionId);
      change(this.#taskDoc, (draft) => {
        const session = idx >= 0 ? draft.sessions.get(idx) : undefined;
        if (session) {
          session.agentSessionId = initSessionId;
          session.status = 'active';
        }
        draft.meta.status = 'working';
        draft.meta.updatedAt = Date.now();
      });
      this.#notifyStatusChange('working');
      return { agentSessionId: initSessionId };
    }

    if (message.type === 'assistant') {
      if ('error' in message && message.error) {
        logger.warn({ error: message.error, sessionId }, 'Assistant message carried an error');
      }
      this.#appendAssistantMessage(message);
      return {};
    }

    if (message.type === 'user' && !('isReplay' in message && message.isReplay)) {
      this.#appendUserToolResults(message);
      return {};
    }

    if (message.type === 'result') {
      return {
        sessionResult: this.#handleResult(message, sessionId, agentSessionId),
      };
    }

    return {};
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

    const conversation = this.#taskDoc.toJSON().conversation;
    const lastMsg = conversation[conversation.length - 1];

    if (lastMsg && lastMsg.role === 'assistant') {
      const lastIdx = conversation.length - 1;
      change(this.#taskDoc, (draft) => {
        for (const block of toolResultBlocks) {
          draft.conversation.get(lastIdx)?.content.push(block);
        }
        draft.meta.updatedAt = Date.now();
      });
    } else {
      /** NOTE: No preceding assistant message -- store as a standalone assistant entry */
      change(this.#taskDoc, (draft) => {
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
        draft.meta.updatedAt = Date.now();
      });
    }
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

    change(this.#taskDoc, (draft) => {
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

      const existingPlans = this.#taskDoc.toJSON().plans;
      if (existingPlans.some((p) => p.toolUseId === block.toolUseId)) {
        logger.debug(
          { toolUseId: block.toolUseId },
          'Plan already exists in CRDT, skipping duplicate'
        );
        continue;
      }

      const planId = nanoid();

      change(this.#taskDoc, (draft) => {
        draft.plans.push({
          planId,
          toolUseId: block.toolUseId,
          markdown: planMarkdown,
          reviewStatus: 'pending',
          reviewFeedback: null,
          createdAt: Date.now(),
        });
      });

      initPlanEditorDoc(loro(this.#taskDoc).container, planId, planMarkdown);

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
    change(this.#taskDoc, (draft) => {
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

  #markFailed(sessionId: string, errorMsg: string): void {
    const idx = this.#findSessionIndex(sessionId);
    change(this.#taskDoc, (draft) => {
      const session = idx >= 0 ? draft.sessions.get(idx) : undefined;
      if (session) {
        session.status = 'failed';
        session.completedAt = Date.now();
        session.error = errorMsg;
      }
      draft.meta.status = 'failed';
      draft.meta.updatedAt = Date.now();
    });
    this.#notifyStatusChange('failed');
  }
}
