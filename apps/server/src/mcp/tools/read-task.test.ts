/**
 * Integration tests for read_task MCP tool.
 *
 * Reads task data from the Loro document.
 * @see docs/whips/daemon-mcp-server-merge.md#mcp-tools
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { McpServer, ToolHandler, ToolInputSchema } from '../index.js';

const mockGetTaskDocument = vi.fn();
const mockVerifySessionToken = vi.fn();

vi.mock('./helpers.js', () => ({
  getTaskDocument: (...args: unknown[]) => mockGetTaskDocument(...args),
  verifySessionToken: (...args: unknown[]) => mockVerifySessionToken(...args),
  errorResponse: (msg: string) => ({
    content: [{ type: 'text', text: msg }],
    isError: true,
  }),
  formatTaskHeader: (meta: {
    title: string;
    status: string;
    repo: string | null;
    createdAt: number;
    updatedAt: number;
  }) => {
    let output = `# ${meta.title}\n\n`;
    output += `**Status:** ${meta.status.replace('_', ' ')}\n`;
    if (meta.repo) output += `**Repo:** ${meta.repo}\n`;
    output += `**Created:** ${new Date(meta.createdAt).toISOString()}\n`;
    output += `**Updated:** ${new Date(meta.updatedAt).toISOString()}\n`;
    output += '\n---\n\n';
    return output;
  },
}));

vi.mock('../../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

import { registerReadTaskTool } from './read-task.js';

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
      title: 'Test Task',
      status: 'in_progress',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      repo: 'test-org/test-repo',
      sessionTokenHash: 'hash123',
    },
    deliverables: {
      toJSON: () => [
        { id: 'del-1', text: 'First deliverable', linkedArtifactId: null },
        { id: 'del-2', text: 'Second deliverable', linkedArtifactId: 'art-1' },
      ],
    },
    linkedPRs: {
      toJSON: () => [
        {
          prNumber: 42,
          status: 'open',
          branch: 'feature-branch',
          title: 'Add feature',
        },
      ],
    },
    comments: { toJSON: () => ({}) },
  };
}

describe('MCP Tool: read_task', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifySessionToken.mockReturnValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('task reading', () => {
    it('reads task by ID', async () => {
      const mockDoc = createMockTaskDoc();
      mockGetTaskDocument.mockResolvedValue({
        success: true,
        doc: mockDoc,
        meta: mockDoc.meta,
      });

      const server = createMockServer();
      registerReadTaskTool(server as unknown as McpServer);
      const { handler } = getTool(server, 'read_task');

      const result = await handler({
        taskId: 'task-123',
        sessionToken: 'valid-token',
      });

      expect(result.isError).toBeUndefined();
      expect(mockGetTaskDocument).toHaveBeenCalledWith('task-123');
    });

    it('returns all task fields', async () => {
      const mockDoc = createMockTaskDoc();
      mockGetTaskDocument.mockResolvedValue({
        success: true,
        doc: mockDoc,
        meta: mockDoc.meta,
      });

      const server = createMockServer();
      registerReadTaskTool(server as unknown as McpServer);
      const { handler } = getTool(server, 'read_task');

      const result = await handler({
        taskId: 'task-123',
        sessionToken: 'valid-token',
      });

      const text = result.content[0]?.text || '';
      expect(text).toContain('Test Task');
      expect(text).toContain('in progress');
    });

    it('includes nested content (deliverables)', async () => {
      const mockDoc = createMockTaskDoc();
      mockGetTaskDocument.mockResolvedValue({
        success: true,
        doc: mockDoc,
        meta: mockDoc.meta,
      });

      const server = createMockServer();
      registerReadTaskTool(server as unknown as McpServer);
      const { handler } = getTool(server, 'read_task');

      const result = await handler({
        taskId: 'task-123',
        sessionToken: 'valid-token',
      });

      const text = result.content[0]?.text || '';
      expect(text).toContain('Deliverables');
      expect(text).toContain('First deliverable');
      expect(text).toContain('Second deliverable');
    });
  });

  describe('error handling', () => {
    it('returns error for non-existent task', async () => {
      mockGetTaskDocument.mockResolvedValue({
        success: false,
        error: 'Task "non-existent" not found.',
      });

      const server = createMockServer();
      registerReadTaskTool(server as unknown as McpServer);
      const { handler } = getTool(server, 'read_task');

      const result = await handler({
        taskId: 'non-existent',
        sessionToken: 'token',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('not found');
    });

    it('handles invalid task ID format', async () => {
      const server = createMockServer();
      registerReadTaskTool(server as unknown as McpServer);
      const { handler } = getTool(server, 'read_task');

      const result = await handler({ taskId: '', sessionToken: 'token' });
      expect(result.isError).toBe(true);
    });
  });
});
