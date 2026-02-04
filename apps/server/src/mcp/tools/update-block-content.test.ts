/**
 * Integration tests for update_block_content MCP tool.
 *
 * Updates content blocks in the task document.
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
  successResponse: (msg: string) => ({
    content: [{ type: 'text', text: msg }],
  }),
}));

vi.mock('../../utils/identity.js', () => ({
  getGitHubUsername: () => mockGetGitHubUsername(),
}));

vi.mock('../../utils/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { registerUpdateBlockContentTool } from './update-block-content.js';

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

function createMockTaskDoc() {
  return {
    meta: {
      id: 'task-123',
      sessionTokenHash: 'hash123',
      updatedAt: Date.now(),
    },
    logEvent: vi.fn(),
  };
}

describe('MCP Tool: update_block_content', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifySessionToken.mockReturnValue(null);
    mockGetGitHubUsername.mockResolvedValue('test-user');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('content updates', () => {
    it('updates text block content', async () => {
      const mockDoc = createMockTaskDoc();
      mockGetTaskDocument.mockResolvedValue({
        success: true,
        doc: mockDoc,
        meta: mockDoc.meta,
      });

      const server = createMockServer();
      registerUpdateBlockContentTool(server as unknown as McpServer);
      const { handler } = getTool(server, 'update_block_content');

      const result = await handler({
        taskId: 'task-123',
        sessionToken: 'valid-token',
        operations: [{ type: 'update', blockId: 'block-1', content: 'New content' }],
      });

      expect(result.isError).toBeUndefined();
      const text = result.content[0]?.text || '';
      expect(text).toContain('update block block-1');
    });

    it('handles insert operation', async () => {
      const mockDoc = createMockTaskDoc();
      mockGetTaskDocument.mockResolvedValue({
        success: true,
        doc: mockDoc,
        meta: mockDoc.meta,
      });

      const server = createMockServer();
      registerUpdateBlockContentTool(server as unknown as McpServer);
      const { handler } = getTool(server, 'update_block_content');

      const result = await handler({
        taskId: 'task-123',
        sessionToken: 'valid-token',
        operations: [{ type: 'insert', afterBlockId: 'block-1', content: 'New block' }],
      });

      expect(result.isError).toBeUndefined();
      const text = result.content[0]?.text || '';
      expect(text).toContain('insert after block-1');
    });

    it('preserves block metadata (logs event)', async () => {
      const mockDoc = createMockTaskDoc();
      mockGetTaskDocument.mockResolvedValue({
        success: true,
        doc: mockDoc,
        meta: mockDoc.meta,
      });

      const server = createMockServer();
      registerUpdateBlockContentTool(server as unknown as McpServer);
      const { handler } = getTool(server, 'update_block_content');

      await handler({
        taskId: 'task-123',
        sessionToken: 'valid-token',
        operations: [{ type: 'update', blockId: 'block-1', content: 'Content' }],
      });

      expect(mockDoc.logEvent).toHaveBeenCalledWith(
        'content_edited',
        'test-user',
        expect.anything()
      );
    });
  });

  describe('validation', () => {
    it('requires block ID for update', async () => {
      const server = createMockServer();
      registerUpdateBlockContentTool(server as unknown as McpServer);
      const { handler } = getTool(server, 'update_block_content');

      await expect(
        handler({
          taskId: 'task-123',
          sessionToken: 'token',
          operations: [{ type: 'update', content: 'No blockId' }],
        })
      ).rejects.toThrow();
    });

    it('validates task exists', async () => {
      mockGetTaskDocument.mockResolvedValue({
        success: false,
        error: 'Task "non-existent" not found.',
      });

      const server = createMockServer();
      registerUpdateBlockContentTool(server as unknown as McpServer);
      const { handler } = getTool(server, 'update_block_content');

      const result = await handler({
        taskId: 'non-existent',
        sessionToken: 'token',
        operations: [{ type: 'update', blockId: 'b-1', content: 'x' }],
      });

      expect(result.isError).toBe(true);
    });
  });

  describe('events', () => {
    it('emits content_edited event', async () => {
      const mockDoc = createMockTaskDoc();
      mockGetTaskDocument.mockResolvedValue({
        success: true,
        doc: mockDoc,
        meta: mockDoc.meta,
      });

      const server = createMockServer();
      registerUpdateBlockContentTool(server as unknown as McpServer);
      const { handler } = getTool(server, 'update_block_content');

      await handler({
        taskId: 'task-123',
        sessionToken: 'valid-token',
        operations: [{ type: 'delete', blockId: 'block-1' }],
      });

      expect(mockDoc.logEvent).toHaveBeenCalledWith(
        'content_edited',
        'test-user',
        expect.objectContaining({ summary: expect.any(String) })
      );
    });
  });
});
