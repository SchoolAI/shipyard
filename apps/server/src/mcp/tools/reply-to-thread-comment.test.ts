/**
 * Integration tests for reply_to_thread_comment MCP tool.
 *
 * Replies to PR thread comments on GitHub.
 * @see docs/whips/daemon-mcp-server-merge.md#mcp-tools
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { McpServer, ToolHandler, ToolInputSchema } from '../index.js';

const mockGetTaskDocument = vi.fn();
const mockVerifySessionToken = vi.fn();
const mockGetGitHubUsername = vi.fn();

vi.mock('./helpers.js', () => ({
  getTaskDocument: (...args: unknown[]) => mockGetTaskDocument(...args),
  verifySessionToken: (...args: unknown[]) => mockVerifySessionToken(...args),
  errorResponse: (msg: string) => ({
    content: [{ type: 'text', text: msg }],
    isError: true,
  }),
}));

vi.mock('../../utils/identity.js', () => ({
  getGitHubUsername: () => mockGetGitHubUsername(),
}));

vi.mock('../../utils/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { registerReplyToThreadCommentTool } from './reply-to-thread-comment.js';

function createMockServer(): {
  tool: ReturnType<typeof vi.fn>;
  registeredTools: Map<string, { schema: ToolInputSchema; handler: ToolHandler }>;
} {
  const registeredTools = new Map<string, { schema: ToolInputSchema; handler: ToolHandler }>();
  return {
    tool: vi.fn((name: string, _desc: string, schema: ToolInputSchema, handler: ToolHandler) => {
      registeredTools.set(name, { schema, handler });
    }),
    registeredTools,
  };
}

/** Get a registered tool or throw an error if not found */
function getTool(
  server: ReturnType<typeof createMockServer>,
  name: string
): { schema: ToolInputSchema; handler: ToolHandler } {
  const tool = server.registeredTools.get(name);
  if (!tool) {
    throw new Error(`Tool "${name}" not registered`);
  }
  return tool;
}

function createMockTaskDoc(comments?: Record<string, unknown>) {
  const allComments = comments ?? {
    'comment-1': {
      kind: 'inline',
      id: 'comment-1',
      threadId: 'thread-1',
      body: 'Original thread comment',
      author: 'reviewer',
      blockId: 'block-123',
    },
  };
  return {
    meta: {
      id: 'task-123',
      sessionTokenHash: 'hash123',
    },
    comments: {
      toJSON: () => allComments,
      set: vi.fn((id: string, comment: unknown) => {
        allComments[id] = comment;
      }),
    },
    logEvent: vi.fn(),
  };
}

describe('MCP Tool: reply_to_thread_comment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifySessionToken.mockReturnValue(null);
    mockGetGitHubUsername.mockResolvedValue('test-user');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('reply posting', () => {
    it('posts reply to thread', async () => {
      const mockDoc = createMockTaskDoc();
      mockGetTaskDocument.mockResolvedValue({
        success: true,
        doc: mockDoc,
        meta: mockDoc.meta,
      });

      const server = createMockServer();
      registerReplyToThreadCommentTool(server as unknown as McpServer);
      const { handler } = getTool(server, 'reply_to_thread_comment');

      const result = await handler({
        taskId: 'task-123',
        sessionToken: 'valid-token',
        threadId: 'thread-1',
        body: 'Thanks for the feedback!',
      });

      expect(result.isError).toBeUndefined();
      expect(result.content[0]?.text).toContain('Reply added to thread');
    });

    it('handles thread context', async () => {
      const mockDoc = createMockTaskDoc();
      mockGetTaskDocument.mockResolvedValue({
        success: true,
        doc: mockDoc,
        meta: mockDoc.meta,
      });

      const server = createMockServer();
      registerReplyToThreadCommentTool(server as unknown as McpServer);
      const { handler } = getTool(server, 'reply_to_thread_comment');

      await handler({
        taskId: 'task-123',
        sessionToken: 'valid-token',
        threadId: 'thread-1',
        body: 'Reply',
      });

      expect(mockDoc.comments.set).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          threadId: 'thread-1',
          kind: 'inline',
        })
      );
    });

    it('returns created reply info', async () => {
      const mockDoc = createMockTaskDoc();
      mockGetTaskDocument.mockResolvedValue({
        success: true,
        doc: mockDoc,
        meta: mockDoc.meta,
      });

      const server = createMockServer();
      registerReplyToThreadCommentTool(server as unknown as McpServer);
      const { handler } = getTool(server, 'reply_to_thread_comment');

      const result = await handler({
        taskId: 'task-123',
        sessionToken: 'valid-token',
        threadId: 'thread-1',
        body: 'Reply',
      });

      const text = result.content[0]?.text || '';
      expect(text).toContain('Comment ID:');
      expect(text).toContain('Thread ID: thread-1');
    });
  });

  describe('validation', () => {
    it('requires thread ID', async () => {
      const server = createMockServer();
      registerReplyToThreadCommentTool(server as unknown as McpServer);
      const { handler } = getTool(server, 'reply_to_thread_comment');

      await expect(
        handler({ taskId: 'task-123', sessionToken: 'token', body: 'Reply' })
      ).rejects.toThrow();
    });

    it('requires reply body', async () => {
      const server = createMockServer();
      registerReplyToThreadCommentTool(server as unknown as McpServer);
      const { handler } = getTool(server, 'reply_to_thread_comment');

      await expect(
        handler({ taskId: 'task-123', sessionToken: 'token', threadId: 't-1' })
      ).rejects.toThrow();
    });
  });

  describe('error handling', () => {
    it('handles thread not found', async () => {
      const mockDoc = createMockTaskDoc({});
      mockGetTaskDocument.mockResolvedValue({
        success: true,
        doc: mockDoc,
        meta: mockDoc.meta,
      });

      const server = createMockServer();
      registerReplyToThreadCommentTool(server as unknown as McpServer);
      const { handler } = getTool(server, 'reply_to_thread_comment');

      const result = await handler({
        taskId: 'task-123',
        sessionToken: 'valid-token',
        threadId: 'non-existent',
        body: 'Reply',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('not found');
    });

    it('handles invalid session token', async () => {
      mockGetTaskDocument.mockResolvedValue({
        success: true,
        doc: createMockTaskDoc(),
        meta: { sessionTokenHash: 'hash123' },
      });
      mockVerifySessionToken.mockReturnValue('Invalid session token');

      const server = createMockServer();
      registerReplyToThreadCommentTool(server as unknown as McpServer);
      const { handler } = getTool(server, 'reply_to_thread_comment');

      const result = await handler({
        taskId: 'task-123',
        sessionToken: 'invalid',
        threadId: 'thread-1',
        body: 'Reply',
      });

      expect(result.isError).toBe(true);
    });
  });
});
