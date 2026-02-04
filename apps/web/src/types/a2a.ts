/**
 * A2A (Agent-to-Agent) conversation types for file-based import/export.
 *
 * These types define the structure of .a2a.json conversation files
 * that can be imported/exported for conversation handoff between agents.
 */

import { z } from 'zod';

/**
 * Zod schema for A2A message part.
 */
export const A2AMessagePartSchema = z.object({
  type: z.string(),
  text: z.string().optional(),
  data: z.unknown().optional(),
  uri: z.string().optional(),
});

/**
 * Zod schema for A2A message.
 * Validates conversation context messages for import/export.
 */
export const A2AMessageSchema = z.object({
  messageId: z.string(),
  role: z.enum(['user', 'agent']),
  parts: z.array(A2AMessagePartSchema),
  contextId: z.string().optional(),
  taskId: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

/**
 * A2A message type for conversation context transfer.
 */
export type A2AMessage = z.infer<typeof A2AMessageSchema>;

/**
 * A2A message part type.
 */
export type A2AMessagePart = z.infer<typeof A2AMessagePartSchema>;

/**
 * Metadata about an exported conversation.
 */
export interface ConversationExportMeta {
  /** Unique ID for this export */
  exportId: string;
  /** Platform the conversation originated from (e.g., "claude-code", "devin") */
  sourcePlatform: string;
  /** Session ID from the source platform */
  sourceSessionId: string;
  /** ID of the plan/task this conversation belongs to */
  planId: string;
  /** Timestamp when the conversation was exported */
  exportedAt: number;
  /** Number of messages in the conversation */
  messageCount: number;
  /** Size of compressed data in bytes (optional) */
  compressedBytes?: number;
  /** Size of uncompressed data in bytes (optional) */
  uncompressedBytes?: number;
}

/**
 * Zod schema for imported conversation file structure.
 */
export const ImportedConversationSchema = z.object({
  meta: z.object({
    exportId: z.string(),
    sourcePlatform: z.string(),
    sourceSessionId: z.string(),
    planId: z.string(),
    exportedAt: z.number(),
    messageCount: z.number(),
    compressedBytes: z.number().optional(),
    uncompressedBytes: z.number().optional(),
  }),
  messages: z.array(z.unknown()),
});

/**
 * Validates an array of A2A messages.
 * Returns valid messages and any validation errors.
 */
export function validateA2AMessages(messages: unknown[]): {
  valid: A2AMessage[];
  errors: Array<{ index: number; error: string }>;
} {
  const valid: A2AMessage[] = [];
  const errors: Array<{ index: number; error: string }> = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const result = A2AMessageSchema.safeParse(msg);
    if (result.success) {
      valid.push(result.data);
    } else {
      errors.push({
        index: i,
        error: result.error.message,
      });
    }
  }

  return { valid, errors };
}

/**
 * Generates a summary for an A2A conversation.
 */
export function summarizeA2AConversation(messages: A2AMessage[]): {
  title: string;
  text: string;
} {
  if (messages.length === 0) {
    return {
      title: 'Empty conversation',
      text: 'No messages to summarize.',
    };
  }

  // Get first user message for title
  const firstUserMessage = messages.find((m) => m.role === 'user');
  const firstTextPart = firstUserMessage?.parts.find((p) => p.type === 'text');
  const firstText = firstTextPart && 'text' in firstTextPart ? firstTextPart.text : '';

  const title =
    firstText && firstText.length > 0
      ? firstText.slice(0, 80) + (firstText.length > 80 ? '...' : '')
      : 'Conversation';

  const userCount = messages.filter((m) => m.role === 'user').length;
  const agentCount = messages.filter((m) => m.role === 'agent').length;

  const text = `${messages.length} messages (${userCount} user, ${agentCount} agent)`;

  return { title, text };
}
