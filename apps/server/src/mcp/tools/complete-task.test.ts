/**
 * Integration tests for complete_task MCP tool.
 *
 * Marks tasks as completed in the Loro document.
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

import { registerCompleteTaskTool } from './complete-task.js';

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

function createMockTaskDoc(overrides?: { status?: string; hasArtifacts?: boolean }) {
  return {
    meta: {
      id: 'task-123',
      status: overrides?.status ?? 'in_progress',
      sessionTokenHash: 'hash123',
      completedAt: null,
      completedBy: null,
      updatedAt: Date.now(),
    },
    artifacts: {
      toJSON: () => (overrides?.hasArtifacts ? [{ id: 'art-1' }] : []),
    },
    updateStatus: vi.fn(),
    logEvent: vi.fn(),
  };
}

describe('MCP Tool: complete_task', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifySessionToken.mockReturnValue(null);
    mockGetGitHubUsername.mockResolvedValue('test-user');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('task completion', () => {
    it('sets task status to completed', async () => {
      const mockDoc = createMockTaskDoc({
        status: 'in_progress',
        hasArtifacts: true,
      });
      mockGetTaskDocument.mockResolvedValue({
        success: true,
        doc: mockDoc,
        meta: mockDoc.meta,
      });

      const server = createMockServer();
      registerCompleteTaskTool(server as unknown as McpServer);
      const { handler } = getTool(server, 'complete_task');

      await handler({
        taskId: 'task-123',
        sessionToken: 'valid-token',
      });

      expect(mockDoc.updateStatus).toHaveBeenCalledWith('completed', 'test-user');
    });

    it('records completion timestamp (via updateStatus)', async () => {
      const mockDoc = createMockTaskDoc({
        status: 'in_progress',
        hasArtifacts: true,
      });
      mockGetTaskDocument.mockResolvedValue({
        success: true,
        doc: mockDoc,
        meta: mockDoc.meta,
      });

      const server = createMockServer();
      registerCompleteTaskTool(server as unknown as McpServer);
      const { handler } = getTool(server, 'complete_task');

      await handler({
        taskId: 'task-123',
        sessionToken: 'valid-token',
      });

      expect(mockDoc.updateStatus).toHaveBeenCalled();
    });

    it('prevents completion if status is not in_progress', async () => {
      const mockDoc = createMockTaskDoc({
        status: 'completed',
        hasArtifacts: true,
      });
      mockGetTaskDocument.mockResolvedValue({
        success: true,
        doc: mockDoc,
        meta: mockDoc.meta,
      });

      const server = createMockServer();
      registerCompleteTaskTool(server as unknown as McpServer);
      const { handler } = getTool(server, 'complete_task');

      const result = await handler({
        taskId: 'task-123',
        sessionToken: 'valid-token',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('Cannot complete');
      expect(result.content[0]?.text).toContain("must be 'in_progress'");
    });
  });

  describe('validation', () => {
    it('requires task ID', async () => {
      const server = createMockServer();
      registerCompleteTaskTool(server as unknown as McpServer);
      const { handler } = getTool(server, 'complete_task');

      await expect(handler({ sessionToken: 'token' })).rejects.toThrow();
    });

    it('validates task exists', async () => {
      mockGetTaskDocument.mockResolvedValue({
        success: false,
        error: 'Task "non-existent" not found.',
      });

      const server = createMockServer();
      registerCompleteTaskTool(server as unknown as McpServer);
      const { handler } = getTool(server, 'complete_task');

      const result = await handler({
        taskId: 'non-existent',
        sessionToken: 'token',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('not found');
    });
  });

  describe('events', () => {
    it('returns task completed message', async () => {
      const mockDoc = createMockTaskDoc({
        status: 'in_progress',
        hasArtifacts: true,
      });
      mockGetTaskDocument.mockResolvedValue({
        success: true,
        doc: mockDoc,
        meta: mockDoc.meta,
      });

      const server = createMockServer();
      registerCompleteTaskTool(server as unknown as McpServer);
      const { handler } = getTool(server, 'complete_task');

      const result = await handler({
        taskId: 'task-123',
        sessionToken: 'valid-token',
      });

      expect(result.isError).toBeUndefined();
      expect(result.content[0]?.text).toContain('Task completed!');
    });
  });
});
