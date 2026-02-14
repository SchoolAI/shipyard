import type {
  CanUseTool,
  PermissionMode,
  Query,
  SDKMessage,
  SettingSource,
} from '@anthropic-ai/claude-agent-sdk';
import { query } from '@anthropic-ai/claude-agent-sdk';
import type { TypedDoc } from '@loro-extended/change';
import { change } from '@loro-extended/change';
import type { A2AMessage, SessionState, TaskDocumentShape } from '@shipyard/loro-schema';
import { nanoid } from 'nanoid';
import { logger } from './logger.js';

const SHIPYARD_SYSTEM_PROMPT_APPEND = `
# Shipyard Permission System

You are running inside Shipyard, a collaborative workspace with a built-in permission system.

CRITICAL: Never ask the user conversationally for permission to perform an action. Always attempt the tool call directly. The permission system will prompt the user for approval automatically when needed. If a tool call is denied, you will receive the denial as a tool result — do not preemptively refuse or ask "should I proceed?" for file operations, bash commands, or any other tool use. Just call the tool.
`;

export interface CreateSessionOptions {
  prompt: string;
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
 * Session lifecycle: pending -> active -> completed | failed
 * Task status mirrors: submitted -> working -> completed | failed
 */
export class SessionManager {
  readonly #taskDoc: TypedDoc<TaskDocumentShape>;

  constructor(taskDoc: TypedDoc<TaskDocumentShape>) {
    this.#taskDoc = taskDoc;
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
        return msg.parts
          .filter((p): p is { kind: 'text'; text: string } => p.kind === 'text')
          .map((p) => p.text)
          .join('\n');
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
   * Create a new Claude Code session and stream messages to the task doc.
   *
   * 1. Pushes a 'pending' session entry
   * 2. Calls query() to start the Agent SDK subprocess
   * 3. Processes each SDKMessage: init, assistant, result
   * 4. Returns the final SessionResult
   */
  async createSession(opts: CreateSessionOptions): Promise<SessionResult> {
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
      draft.meta.status = 'working';
      draft.meta.updatedAt = now;
    });

    const response: Query = query({
      prompt: opts.prompt,
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
      },
    });

    return this.#processMessages(response, sessionId);
  }

  /**
   * Resume an existing Claude Code session by looking up the agentSessionId
   * from the task doc, then passing it as `resume` to query().
   */
  async resumeSession(
    sessionId: string,
    prompt: string,
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
      draft.meta.status = 'working';
      draft.meta.updatedAt = now;
    });

    const response: Query = query({
      prompt,
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
        settingSources: ['project'],
        systemPrompt: {
          type: 'preset',
          preset: 'claude_code',
          append: SHIPYARD_SYSTEM_PROMPT_APPEND,
        },
      },
    });

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
      const idx = this.#findSessionIndex(sessionId);
      change(this.#taskDoc, (draft) => {
        const session = idx >= 0 ? draft.sessions.get(idx) : undefined;
        if (session) {
          session.agentSessionId = initSessionId;
          session.status = 'active';
        }
        draft.meta.updatedAt = Date.now();
      });
      return { agentSessionId: initSessionId };
    }

    if (message.type === 'assistant') {
      if ('error' in message && message.error) {
        logger.warn({ error: message.error, sessionId }, 'Assistant message carried an error');
      }
      this.#appendAssistantMessage(message);
      return {};
    }

    if (message.type === 'result') {
      return {
        sessionResult: this.#handleResult(message, sessionId, agentSessionId),
      };
    }

    return {};
  }

  #appendAssistantMessage(message: SDKMessage & { type: 'assistant' }): void {
    const content = message.message.content;
    if (!Array.isArray(content)) return;

    interface TextBlock {
      type: 'text';
      text: string;
    }
    // eslint-disable-next-line no-restricted-syntax -- SDK content blocks typed as unknown[], need narrowing for text extraction
    const textParts = (content as Array<{ type: string; text?: string }>)
      .filter(
        (block): block is TextBlock => block.type === 'text' && typeof block.text === 'string'
      )
      .map((block) => block.text);

    if (textParts.length === 0) return;

    const taskId = this.#taskDoc.toJSON().meta.id;

    const a2aMessage: A2AMessage = {
      messageId: nanoid(),
      role: 'agent',
      contextId: null,
      taskId,
      parts: textParts.map((text) => ({ kind: 'text' as const, text })),
      referenceTaskIds: [],
      timestamp: Date.now(),
    };

    change(this.#taskDoc, (draft) => {
      draft.conversation.push(a2aMessage);
      draft.meta.updatedAt = Date.now();
    });
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
      draft.meta.status = isSuccess ? 'completed' : 'failed';
      draft.meta.updatedAt = completedAt;
    });

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
  }
}
