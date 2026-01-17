import { z } from 'zod';

/**
 * BlockNote comment content - can be a string or structured content.
 * BlockNote stores comment bodies as arrays of block content.
 */
export type CommentBody = string | unknown[];

/**
 * A single comment within a thread.
 */
export interface ThreadComment {
  id: string;
  userId: string;
  /** Comment content - may be string or BlockNote block structure */
  body: CommentBody;
  createdAt: number;
}

/**
 * A comment thread attached to selected text.
 */
export interface Thread {
  id: string;
  comments: ThreadComment[];
  resolved?: boolean;
  /** The text that was selected when the comment was created */
  selectedText?: string;
}

/**
 * Zod schema for thread comment validation.
 */
export const ThreadCommentSchema = z.object({
  id: z.string(),
  userId: z.string(),
  body: z.union([z.string(), z.array(z.unknown())]),
  createdAt: z.number(),
});

/**
 * Zod schema for thread validation.
 */
export const ThreadSchema = z.object({
  id: z.string(),
  comments: z.array(ThreadCommentSchema),
  resolved: z.boolean().optional(),
  selectedText: z.string().optional(),
});

/**
 * Type guard for checking if a value is a valid Thread.
 */
export function isThread(value: unknown): value is Thread {
  return ThreadSchema.safeParse(value).success;
}

/**
 * Safely parse threads from Y.Map data.
 * Returns only valid threads, silently dropping invalid ones.
 */
export function parseThreads(data: Record<string, unknown>): Thread[] {
  const threads: Thread[] = [];
  for (const [_key, value] of Object.entries(data)) {
    const result = ThreadSchema.safeParse(value);
    if (result.success) {
      threads.push(result.data);
    }
  }
  return threads;
}

/**
 * Extract plain text from BlockNote comment body.
 * Handles both string and structured block content.
 */
export function extractTextFromCommentBody(body: CommentBody): string {
  if (typeof body === 'string') {
    return body;
  }

  if (!Array.isArray(body)) {
    return '';
  }

  return body
    .map((block) => {
      if (typeof block === 'string') return block;
      if (typeof block !== 'object' || block === null) return '';

      const blockObj = block as { content?: unknown };
      if (Array.isArray(blockObj.content)) {
        return blockObj.content
          .map((item: unknown) => {
            if (typeof item === 'string') return item;
            if (typeof item === 'object' && item !== null && 'text' in item) {
              return (item as { text: string }).text;
            }
            return '';
          })
          .join('');
      }

      return '';
    })
    .join('\n');
}

/**
 * Extract @mentions from comment body.
 * Looks for patterns like @username in the text.
 *
 * @param body - Comment body (string or structured content)
 * @returns Array of mentioned GitHub usernames (without @ prefix)
 */
export function extractMentions(body: CommentBody): string[] {
  const text = extractTextFromCommentBody(body);
  const mentionRegex = /@([a-zA-Z0-9_-]+)/g;
  const mentions: string[] = [];
  let match: RegExpExecArray | null;

  // biome-ignore lint/suspicious/noAssignInExpressions: Standard regex exec loop pattern
  while ((match = mentionRegex.exec(text)) !== null) {
    if (match[1]) {
      mentions.push(match[1]);
    }
  }

  // Remove duplicates
  return [...new Set(mentions)];
}
