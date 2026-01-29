/**
 * Conversation export types and converters for A2A protocol.
 *
 * This module provides:
 * 1. A2A Message schema definitions (following A2A spec)
 * 2. Claude Code JSONL transcript parser
 * 3. Converter from Claude Code format to A2A format
 *
 * A2A (Agent-to-Agent) is an emerging protocol for interoperability
 * between AI agent platforms. See: https://a2a-protocol.org/latest/specification/
 *
 * @see Issue #41 - Context Teleportation
 */

import { z } from 'zod';

/**
 * A2A Text Part - plain text content
 */
export const A2ATextPartSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
});
export type A2ATextPart = z.infer<typeof A2ATextPartSchema>;

/**
 * A2A Data Part - structured data (JSON)
 * Used for tool calls, results, and other structured content
 */
export const A2ADataPartSchema = z.object({
  type: z.literal('data'),
  data: z.unknown(),
});
export type A2ADataPart = z.infer<typeof A2ADataPartSchema>;

/**
 * A2A File Part - file reference
 * Used for file attachments, images, etc.
 */
export const A2AFilePartSchema = z.object({
  type: z.literal('file'),
  uri: z.string(),
  mediaType: z.string().optional(),
  name: z.string().optional(),
});
export type A2AFilePart = z.infer<typeof A2AFilePartSchema>;

/**
 * A2A Part schema - validates any of the three part types
 * Uses a custom approach to avoid Zod v4 issues with union arrays
 */
/**
 * Type guard helper to check for property existence and type.
 * Avoids unsafe type assertions in validation logic.
 */
function hasStringProperty(obj: Record<string, unknown>, prop: string): boolean {
  return prop in obj && typeof obj[prop] === 'string';
}

/**
 * Convert passthrough object to Record for safe property access.
 * Uses Object.fromEntries/entries to avoid type assertions.
 */
function toRecord(obj: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj));
}

export const A2APartSchema = z
  .object({
    type: z.enum(['text', 'data', 'file']),
  })
  .passthrough()
  .superRefine((val, ctx) => {
    const record = toRecord(val);
    if (val.type === 'text') {
      if (!hasStringProperty(record, 'text')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'text part must have a string text field',
        });
      }
    } else if (val.type === 'data') {
      if (!('data' in val)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'data part must have a data field',
        });
      }
    } else if (val.type === 'file') {
      if (!hasStringProperty(record, 'uri')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'file part must have a string uri field',
        });
      }
    }
  });
export type A2APart = A2ATextPart | A2ADataPart | A2AFilePart;

/**
 * A2A Message - the core message type
 * Represents a single message in a conversation
 *
 * Uses z.any() for parts array to avoid Zod v4 issues with complex
 * union types in arrays. Parts are validated via superRefine.
 */
/**
 * Validates A2A parts array manually.
 * Returns true if all parts are valid.
 */
function isValidA2APart(part: unknown): boolean {
  if (!part || typeof part !== 'object') return false;
  const p = toRecord(part);
  const t = p.type;
  if (t === 'text') {
    return typeof p.text === 'string';
  } else if (t === 'data') {
    return 'data' in p;
  } else if (t === 'file') {
    return typeof p.uri === 'string';
  }
  return false;
}

function isValidA2AParts(parts: unknown): parts is A2APart[] {
  if (!Array.isArray(parts)) return false;
  return parts.every(isValidA2APart);
}

/**
 * A2A Message schema - validates the full message structure.
 * Uses a custom schema to work around Zod v4 issues with complex union arrays.
 */
export const A2AMessageSchema = z
  .object({
    messageId: z.string(),
    role: z.enum(['user', 'agent']),
    contextId: z.string().optional(),
    taskId: z.string().optional(),
    referenceTaskIds: z.array(z.string()).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    extensions: z.array(z.string()).optional(),
    parts: z.array(z.unknown()),
  })
  .passthrough()
  .refine(
    (val) => {
      return isValidA2AParts(val.parts);
    },
    {
      message: 'Invalid parts array - each part must have valid type and required fields',
      path: ['parts'],
    }
  )
  .transform((val) => {
    /** After refine validates, parts is guaranteed to be A2APart[] */
    const parts: A2APart[] = val.parts.map((p) => {
      if (!p || typeof p !== 'object') {
        throw new Error('Invalid part: not an object');
      }
      const record = toRecord(p);
      const partType = record.type;
      if (partType === 'text') {
        return { type: 'text' as const, text: String(record.text) };
      } else if (partType === 'data') {
        return { type: 'data' as const, data: record.data };
      } else {
        return {
          type: 'file' as const,
          uri: String(record.uri),
          mediaType: typeof record.mediaType === 'string' ? record.mediaType : undefined,
          name: typeof record.name === 'string' ? record.name : undefined,
        };
      }
    });
    return { ...val, parts };
  });
export type A2AMessage = {
  messageId: string;
  role: 'user' | 'agent';
  parts: A2APart[];
  contextId?: string;
  taskId?: string;
  referenceTaskIds?: string[];
  metadata?: Record<string, unknown>;
  extensions?: string[];
};

/**
 * Metadata about a conversation export
 */
export const ConversationExportMetaSchema = z.object({
  exportId: z.string(),
  sourcePlatform: z.string(),
  sourceSessionId: z.string(),
  planId: z.string(),
  exportedAt: z.number(),
  messageCount: z.number(),
  compressedBytes: z.number(),
  uncompressedBytes: z.number(),
});
export type ConversationExportMeta = z.infer<typeof ConversationExportMetaSchema>;

/**
 * Claude Code text content block
 */
const ClaudeCodeTextBlockSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
});
type ClaudeCodeTextBlock = z.infer<typeof ClaudeCodeTextBlockSchema>;

/**
 * Claude Code tool use content block
 */
const ClaudeCodeToolUseBlockSchema = z.object({
  type: z.literal('tool_use'),
  id: z.string(),
  name: z.string(),
  input: z.record(z.string(), z.unknown()),
});
type ClaudeCodeToolUseBlock = z.infer<typeof ClaudeCodeToolUseBlockSchema>;

/**
 * Claude Code tool result content block
 */
const ClaudeCodeToolResultBlockSchema = z.object({
  type: z.literal('tool_result'),
  tool_use_id: z.string(),
  content: z.unknown(),
  is_error: z.boolean().optional(),
});
type ClaudeCodeToolResultBlock = z.infer<typeof ClaudeCodeToolResultBlockSchema>;

/**
 * Union type for Claude Code content blocks
 */
type ClaudeCodeContentBlock =
  | ClaudeCodeTextBlock
  | ClaudeCodeToolUseBlock
  | ClaudeCodeToolResultBlock;

/**
 * Claude Code content block schema
 * Uses a custom approach to avoid Zod v4 issues with union arrays.
 * The transform at the end ensures the output type is properly narrowed.
 */
const ClaudeCodeContentBlockSchema = z
  .object({
    type: z.enum(['text', 'tool_use', 'tool_result']),
  })
  .passthrough()
  .superRefine((val, ctx) => {
    const typedVal = toRecord(val);
    if (val.type === 'text') {
      if (typeof typedVal.text !== 'string') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'text block must have a string text field',
        });
      }
    } else if (val.type === 'tool_use') {
      if (typeof typedVal.id !== 'string') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'tool_use block must have a string id field',
        });
      }
      if (typeof typedVal.name !== 'string') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'tool_use block must have a string name field',
        });
      }
      if (typeof typedVal.input !== 'object' || typedVal.input === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'tool_use block must have an object input field',
        });
      }
    } else if (val.type === 'tool_result') {
      if (typeof typedVal.tool_use_id !== 'string') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'tool_result block must have a string tool_use_id field',
        });
      }
    }
  })
  .transform((val): ClaudeCodeContentBlock => {
    const record = toRecord(val);
    switch (val.type) {
      case 'text':
        return { type: 'text', text: String(record.text) };
      case 'tool_use': {
        const inputVal = record.input;
        if (!inputVal || typeof inputVal !== 'object') {
          throw new Error('Invalid tool_use: input is not an object');
        }
        return {
          type: 'tool_use',
          id: String(record.id),
          name: String(record.name),
          input: toRecord(inputVal),
        };
      }
      case 'tool_result':
        return {
          type: 'tool_result',
          tool_use_id: String(record.tool_use_id),
          content: record.content,
          is_error: typeof record.is_error === 'boolean' ? record.is_error : undefined,
        };
      default: {
        // Exhaustive check on discriminant (val has passthrough props, so check type field)
        const _exhaustive: never = val.type;
        return assertNever(_exhaustive);
      }
    }
  });

/**
 * Claude Code token usage
 */
const ClaudeCodeUsageSchema = z.object({
  input_tokens: z.number(),
  output_tokens: z.number(),
  cache_creation_input_tokens: z.number().optional(),
  cache_read_input_tokens: z.number().optional(),
});

/**
 * Claude Code message inner structure
 */
const ClaudeCodeMessageInnerSchema = z.object({
  role: z.string(),
  content: z.array(ClaudeCodeContentBlockSchema),
  id: z.string().optional(),
  model: z.string().optional(),
  usage: ClaudeCodeUsageSchema.optional(),
});

/**
 * Claude Code JSONL message schema
 * This is the full structure of each line in the session.jsonl file
 */
export const ClaudeCodeMessageSchema = z.object({
  sessionId: z.string(),
  type: z.enum(['user', 'assistant', 'summary']),
  message: ClaudeCodeMessageInnerSchema,
  uuid: z.string(),
  timestamp: z.string(),
  parentUuid: z.string().optional(),
  costUSD: z.number().optional(),
  durationMs: z.number().optional(),
});
export type ClaudeCodeMessage = z.infer<typeof ClaudeCodeMessageSchema>;

/**
 * Result of parsing a transcript - includes both successful and failed parses
 */
export interface ParseTranscriptResult {
  messages: ClaudeCodeMessage[];
  errors: Array<{ line: number; error: string }>;
}

/**
 * Parses a Claude Code JSONL transcript from a string.
 *
 * Each line in the JSONL file is a separate JSON object representing
 * a message in the conversation. Malformed lines are captured in errors
 * array rather than throwing.
 *
 * @param content - Raw JSONL string content
 * @returns Parsed messages and any parsing errors
 */
export function parseClaudeCodeTranscriptString(content: string): ParseTranscriptResult {
  const lines = content.split('\n').filter((line) => line.trim());
  const messages: ClaudeCodeMessage[] = [];
  const errors: Array<{ line: number; error: string }> = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    try {
      const parsed: unknown = JSON.parse(line);
      const result = ClaudeCodeMessageSchema.safeParse(parsed);

      if (result.success) {
        messages.push(result.data);
      } else {
        errors.push({
          line: i + 1,
          error: `Validation failed: ${result.error.message}`,
        });
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      errors.push({
        line: i + 1,
        error: `JSON parse error: ${errorMessage}`,
      });
    }
  }

  return { messages, errors };
}

/**
 * Type guard helper for exhaustive checking in switch statements
 */
function assertNever(x: never): never {
  throw new Error(`Unhandled case: ${JSON.stringify(x)}`);
}

/**
 * Converts a single Claude Code content block to A2A parts.
 *
 * @param block - Claude Code content block
 * @returns Array of A2A parts (may return multiple for complex blocks)
 */
function convertContentBlock(block: ClaudeCodeContentBlock): A2APart[] {
  switch (block.type) {
    case 'text':
      return [
        {
          type: 'text',
          text: block.text,
        },
      ];

    case 'tool_use':
      return [
        {
          type: 'data',
          data: {
            toolUse: {
              name: block.name,
              id: block.id,
              input: block.input,
            },
          },
        },
      ];

    case 'tool_result':
      return [
        {
          type: 'data',
          data: {
            toolResult: {
              toolUseId: block.tool_use_id,
              content: block.content,
              isError: block.is_error ?? false,
            },
          },
        },
      ];

    default:
      return assertNever(block);
  }
}

/**
 * Converts a single Claude Code message to A2A format.
 *
 * @param msg - Claude Code message
 * @param contextId - Context ID to associate with the message
 * @returns A2A message
 */
function convertMessage(msg: ClaudeCodeMessage, contextId: string): A2AMessage {
  const role = msg.message.role === 'user' ? 'user' : 'agent';

  const parts: A2APart[] = msg.message.content.flatMap((block) => convertContentBlock(block));

  return {
    messageId: msg.uuid,
    role,
    parts,
    contextId,
    metadata: {
      timestamp: msg.timestamp,
      platform: 'claude-code',
      parentMessageId: msg.parentUuid,
      model: msg.message.model,
      usage: msg.message.usage,
      costUSD: msg.costUSD,
      durationMs: msg.durationMs,
    },
  };
}

/**
 * Converts an array of Claude Code messages to A2A format.
 *
 * Filters out 'summary' type messages as they are internal to Claude Code
 * and not part of the actual conversation.
 *
 * @param messages - Array of Claude Code messages
 * @param contextId - Context ID to associate with all messages (typically the plan ID)
 * @returns Array of A2A messages
 */
export function claudeCodeToA2A(messages: ClaudeCodeMessage[], contextId: string): A2AMessage[] {
  return messages
    .filter((msg) => msg.type !== 'summary')
    .map((msg) => convertMessage(msg, contextId));
}

/**
 * Validates an array of A2A messages.
 * Useful for validating imported conversations.
 *
 * @param messages - Array of potential A2A messages
 * @returns Validation result with valid messages and errors
 */
export function validateA2AMessages(messages: unknown[]): {
  valid: A2AMessage[];
  errors: Array<{ index: number; error: string }>;
} {
  const valid: A2AMessage[] = [];
  const errors: Array<{ index: number; error: string }> = [];

  for (let i = 0; i < messages.length; i++) {
    const result = A2AMessageSchema.safeParse(messages[i]);
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
 * Get the first text part from a message's parts.
 */
function getFirstTextPart(parts: A2APart[]): A2ATextPart | undefined {
  const textParts = parts.filter((p): p is A2ATextPart => p.type === 'text');
  return textParts[0];
}

/**
 * Extract title from the first user message (truncated to 50 chars).
 */
function extractTitleFromMessage(msg: A2AMessage | undefined): string {
  if (!msg) return 'Imported Conversation';
  const firstPart = getFirstTextPart(msg.parts);
  if (!firstPart) return 'Imported Conversation';
  const text = firstPart.text;
  return text.length > 50 ? `${text.slice(0, 50)}...` : text;
}

/**
 * Check if a data part contains tool use or result.
 */
function isToolDataPart(part: A2ADataPart): boolean {
  const data = part.data;
  return Boolean(data && typeof data === 'object' && ('toolUse' in data || 'toolResult' in data));
}

/**
 * Count tool interactions in a message's parts.
 */
function countToolInteractions(parts: A2APart[]): number {
  const dataParts = parts.filter((p): p is A2ADataPart => p.type === 'data');
  return dataParts.filter(isToolDataPart).length;
}

/**
 * Create a summary line for a single message.
 */
function summarizeMessage(msg: A2AMessage): string | undefined {
  const prefix = msg.role === 'user' ? 'User' : 'Agent';
  const firstTextPart = getFirstTextPart(msg.parts);

  if (firstTextPart) {
    const preview = firstTextPart.text.slice(0, 100);
    const truncated = firstTextPart.text.length > 100 ? '...' : '';
    return `${prefix}: ${preview}${truncated}`;
  }

  const toolCount = countToolInteractions(msg.parts);
  if (toolCount > 0) {
    return `${prefix}: [${toolCount} tool interaction(s)]`;
  }

  return undefined;
}

/**
 * Extracts a brief summary from A2A messages for display purposes.
 * Useful when creating a plan from imported conversation.
 *
 * @param messages - Array of A2A messages
 * @param maxMessages - Maximum number of messages to include in summary (default: 3)
 * @returns Object with title (first user message) and text (summary of exchange)
 */
export function summarizeA2AConversation(
  messages: A2AMessage[],
  maxMessages = 3
): { title: string; text: string } {
  const firstUserMessage = messages.find((m) => m.role === 'user');
  const title = extractTitleFromMessage(firstUserMessage);

  const messagesToSummarize = messages.slice(0, maxMessages);
  const summaryLines = messagesToSummarize
    .map(summarizeMessage)
    .filter((line): line is string => typeof line === 'string');

  if (messages.length > maxMessages) {
    summaryLines.push(`... and ${messages.length - maxMessages} more messages`);
  }

  return {
    title,
    text: summaryLines.join('\n'),
  };
}

/**
 * Type guard for checking if a data part contains tool use info.
 */
interface ToolUseData {
  toolUse: {
    name: string;
    id: string;
    input: Record<string, unknown>;
  };
}

/**
 * Type guard for checking if a data part contains tool result info.
 */
interface ToolResultData {
  toolResult: {
    toolUseId: string;
    content: unknown;
    isError?: boolean;
  };
}

function isToolUseData(data: unknown): data is ToolUseData {
  if (!data || typeof data !== 'object') return false;
  const d = toRecord(data);
  if (!d.toolUse || typeof d.toolUse !== 'object') return false;
  const toolUse = toRecord(d.toolUse);
  return (
    typeof toolUse.name === 'string' &&
    typeof toolUse.id === 'string' &&
    typeof toolUse.input === 'object'
  );
}

function isToolResultData(data: unknown): data is ToolResultData {
  if (!data || typeof data !== 'object') return false;
  const d = toRecord(data);
  if (!d.toolResult || typeof d.toolResult !== 'object') return false;
  const toolResult = toRecord(d.toolResult);
  return typeof toolResult.toolUseId === 'string';
}

/**
 * Converts a single A2A part to Claude Code content block(s).
 *
 * @param part - A2A part to convert
 * @returns Array of Claude Code content blocks
 */
function convertA2APartToContentBlock(part: A2APart): ClaudeCodeContentBlock[] {
  switch (part.type) {
    case 'text':
      return [
        {
          type: 'text',
          text: part.text,
        },
      ];

    case 'data': {
      const data = part.data;

      if (isToolUseData(data)) {
        return [
          {
            type: 'tool_use',
            id: data.toolUse.id,
            name: data.toolUse.name,
            input: data.toolUse.input,
          },
        ];
      }

      if (isToolResultData(data)) {
        return [
          {
            type: 'tool_result',
            tool_use_id: data.toolResult.toolUseId,
            content: data.toolResult.content,
            is_error: data.toolResult.isError,
          },
        ];
      }

      return [
        {
          type: 'text',
          text: `[Data: ${JSON.stringify(data)}]`,
        },
      ];
    }

    case 'file':
      return [
        {
          type: 'text',
          text: `[File: ${part.name ?? part.uri}${part.mediaType ? ` (${part.mediaType})` : ''}]`,
        },
      ];

    default: {
      const _exhaustiveCheck: never = part;
      throw new Error(`Unhandled part type: ${JSON.stringify(_exhaustiveCheck)}`);
    }
  }
}

/**
 * Zod schema for Claude Code usage metadata
 */
const UsageMetadataSchema = z.object({
  input_tokens: z.number(),
  output_tokens: z.number(),
  cache_creation_input_tokens: z.number().optional(),
  cache_read_input_tokens: z.number().optional(),
});

type UsageMetadata = z.infer<typeof UsageMetadataSchema>;

/**
 * Parse and validate usage metadata from A2A message metadata.
 */
function parseUsageMetadata(usage: unknown): UsageMetadata | undefined {
  const result = UsageMetadataSchema.safeParse(usage);
  return result.success ? result.data : undefined;
}

/**
 * Converts an A2A message to Claude Code format.
 *
 * @param msg - A2A message to convert
 * @param sessionId - Session ID to use for the Claude Code message
 * @param parentUuid - Optional parent message UUID
 * @returns Claude Code message
 */
function convertA2AToClaudeCodeMessage(
  msg: A2AMessage,
  sessionId: string,
  parentUuid?: string
): ClaudeCodeMessage {
  const role = msg.role === 'user' ? 'user' : 'assistant';
  const type = msg.role === 'user' ? 'user' : 'assistant';

  const content = msg.parts.flatMap(convertA2APartToContentBlock);

  const metadata = msg.metadata || {};
  const timestamp =
    typeof metadata.timestamp === 'string' ? metadata.timestamp : new Date().toISOString();
  const model = typeof metadata.model === 'string' ? metadata.model : undefined;
  const usage = parseUsageMetadata(metadata.usage);
  const costUSD = typeof metadata.costUSD === 'number' ? metadata.costUSD : undefined;
  const durationMs = typeof metadata.durationMs === 'number' ? metadata.durationMs : undefined;

  const claudeMsg: ClaudeCodeMessage = {
    sessionId,
    type,
    message: {
      role,
      content,
      ...(model && { model }),
      ...(usage && { usage }),
    },
    uuid: msg.messageId,
    timestamp,
    ...(parentUuid && { parentUuid }),
    ...(costUSD !== undefined && { costUSD }),
    ...(durationMs !== undefined && { durationMs }),
  };

  return claudeMsg;
}

/**
 * Converts an array of A2A messages to Claude Code format.
 *
 * This is the inverse of claudeCodeToA2A(). It converts A2A messages
 * back to the Claude Code JSONL format for import into Claude Code sessions.
 *
 * @param messages - Array of A2A messages to convert
 * @param sessionId - Optional session ID (generates new one if not provided)
 * @returns Array of Claude Code messages
 */
export function a2aToClaudeCode(messages: A2AMessage[], sessionId?: string): ClaudeCodeMessage[] {
  const resolvedSessionId = sessionId ?? crypto.randomUUID();

  let parentUuid: string | undefined;

  return messages.map((msg) => {
    const claudeMsg = convertA2AToClaudeCodeMessage(msg, resolvedSessionId, parentUuid);
    parentUuid = claudeMsg.uuid;
    return claudeMsg;
  });
}

/**
 * Formats an array of Claude Code messages as JSONL string.
 *
 * Claude Code session files are JSONL (JSON Lines) format where each
 * line is a complete JSON object representing one message.
 *
 * @param messages - Array of Claude Code messages
 * @returns JSONL formatted string
 */
export function formatAsClaudeCodeJSONL(messages: ClaudeCodeMessage[]): string {
  return messages.map((msg) => JSON.stringify(msg)).join('\n');
}
