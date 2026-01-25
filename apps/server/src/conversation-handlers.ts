/**
 * Pure handler functions for conversation import/export operations.
 * These functions contain the business logic extracted from Express handlers.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  a2aToClaudeCode,
  type ConversationContext,
  type ConversationHandlers,
  formatAsClaudeCodeJSONL,
  type ImportConversationResponse,
  validateA2AMessages,
} from '@shipyard/schema';
import { nanoid } from 'nanoid';

interface ImportConversationInput {
  a2aMessages: unknown[];
  meta?: {
    planId?: string;
    sourcePlatform?: string;
    sessionId?: string;
  };
}

export async function importConversationHandler(
  input: ImportConversationInput,
  ctx: ConversationContext
): Promise<ImportConversationResponse> {
  const { a2aMessages, meta } = input;

  if (!a2aMessages || !Array.isArray(a2aMessages)) {
    return {
      success: false,
      error: 'Missing or invalid a2aMessages',
    };
  }

  if (a2aMessages.length === 0) {
    return {
      success: false,
      error: 'a2aMessages array is empty',
    };
  }

  try {
    /** Validate the A2A messages before conversion */
    const { valid, errors } = validateA2AMessages(a2aMessages);
    if (errors.length > 0) {
      return {
        success: false,
        error: `Invalid A2A messages: ${errors.map((e) => e.error).join(', ')}`,
      };
    }

    const sessionId = nanoid();
    const claudeMessages = a2aToClaudeCode(valid, sessionId);
    const jsonl = formatAsClaudeCodeJSONL(claudeMessages);

    const projectName = meta?.planId
      ? `shipyard-${meta.planId.slice(0, 8)}`
      : process.cwd().split('/').pop() || 'shipyard';

    const projectPath = join(homedir(), '.claude', 'projects', projectName);
    await mkdir(projectPath, { recursive: true });
    const transcriptPath = join(projectPath, `${sessionId}.jsonl`);

    await writeFile(transcriptPath, jsonl, 'utf-8');

    ctx.logger.info(
      {
        sessionId,
        transcriptPath,
        messageCount: claudeMessages.length,
        sourcePlatform: meta?.sourcePlatform,
      },
      'Created Claude Code session from imported conversation'
    );

    return {
      success: true,
      sessionId,
      transcriptPath,
      messageCount: claudeMessages.length,
    };
  } catch (error) {
    ctx.logger.error({ error }, 'Failed to import conversation');
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Creates conversation handlers that use the provided context.
 * This is the factory function used by the tRPC context.
 */
export function createConversationHandlers(): ConversationHandlers {
  return {
    importConversation: (input, ctx) => importConversationHandler(input, ctx),
  };
}
