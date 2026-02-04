/**
 * Integration tests for regenerate_session_token MCP tool.
 *
 * Regenerates session token hash for authentication.
 * @see docs/whips/daemon-mcp-server-merge.md#mcp-tools
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { McpServer, ToolHandler, ToolInputSchema } from '../index.js';

const mockGetTaskDocument = vi.fn();
const mockGetVerifiedGitHubUsername = vi.fn();

vi.mock('./helpers.js', () => ({
  getTaskDocument: (...args: unknown[]) => mockGetTaskDocument(...args),
  errorResponse: (msg: string) => ({
    content: [{ type: 'text', text: msg }],
    isError: true,
  }),
}));

vi.mock('../../utils/identity.js', () => ({
  getVerifiedGitHubUsername: () => mockGetVerifiedGitHubUsername(),
}));

vi.mock('../../utils/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { registerRegenerateSessionTokenTool } from './regenerate-session-token.js';

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

function createMockTaskDoc(overrides?: { ownerId?: string | null }) {
  return {
    meta: {
      id: 'task-123',
      title: 'Test Task',
      ownerId: overrides?.ownerId ?? 'test-user',
      sessionTokenHash: 'old-hash',
      updatedAt: Date.now(),
    },
    logEvent: vi.fn(),
  };
}

describe('MCP Tool: regenerate_session_token', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetVerifiedGitHubUsername.mockResolvedValue('test-user');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('token regeneration', () => {
    it('generates new session token', async () => {
      const mockDoc = createMockTaskDoc();
      mockGetTaskDocument.mockResolvedValue({
        success: true,
        doc: mockDoc,
        meta: mockDoc.meta,
      });

      const server = createMockServer();
      registerRegenerateSessionTokenTool(server as unknown as McpServer);
      const { handler } = getTool(server, 'regenerate_session_token');

      const result = await handler({ taskId: 'task-123' });

      expect(result.isError).toBeUndefined();
      expect(result.content[0]?.text).toContain('Session token regenerated');
      expect(result.content[0]?.text).toContain('New Session Token:');
    });

    it('stores hashed token in Loro doc', async () => {
      const mockDoc = createMockTaskDoc();
      mockGetTaskDocument.mockResolvedValue({
        success: true,
        doc: mockDoc,
        meta: mockDoc.meta,
      });

      const server = createMockServer();
      registerRegenerateSessionTokenTool(server as unknown as McpServer);
      const { handler } = getTool(server, 'regenerate_session_token');

      await handler({ taskId: 'task-123' });

      expect(mockDoc.meta.sessionTokenHash).not.toBe('old-hash');
      expect(mockDoc.meta.sessionTokenHash.length).toBeGreaterThan(0);
    });

    it('invalidates old token (by replacing hash)', async () => {
      const mockDoc = createMockTaskDoc();
      const oldHash = mockDoc.meta.sessionTokenHash;
      mockGetTaskDocument.mockResolvedValue({
        success: true,
        doc: mockDoc,
        meta: mockDoc.meta,
      });

      const server = createMockServer();
      registerRegenerateSessionTokenTool(server as unknown as McpServer);
      const { handler } = getTool(server, 'regenerate_session_token');

      await handler({ taskId: 'task-123' });

      expect(mockDoc.meta.sessionTokenHash).not.toBe(oldHash);
    });
  });

  describe('security', () => {
    it('uses secure random generation (token is different each time)', async () => {
      const mockDoc = createMockTaskDoc();
      mockGetTaskDocument.mockResolvedValue({
        success: true,
        doc: mockDoc,
        meta: mockDoc.meta,
      });

      const server = createMockServer();
      registerRegenerateSessionTokenTool(server as unknown as McpServer);
      const { handler } = getTool(server, 'regenerate_session_token');

      const result1 = await handler({ taskId: 'task-123' });
      const token1 = result1.content[0]?.text?.match(/New Session Token: (\S+)/)?.[1];

      // Reset hash for second call
      mockDoc.meta.sessionTokenHash = 'old-hash';

      const result2 = await handler({ taskId: 'task-123' });
      const token2 = result2.content[0]?.text?.match(/New Session Token: (\S+)/)?.[1];

      expect(token1).not.toBe(token2);
    });

    it('properly hashes token before storage', async () => {
      const mockDoc = createMockTaskDoc();
      mockGetTaskDocument.mockResolvedValue({
        success: true,
        doc: mockDoc,
        meta: mockDoc.meta,
      });

      const server = createMockServer();
      registerRegenerateSessionTokenTool(server as unknown as McpServer);
      const { handler } = getTool(server, 'regenerate_session_token');

      const result = await handler({ taskId: 'task-123' });
      const token = result.content[0]?.text?.match(/New Session Token: (\S+)/)?.[1];

      // The stored hash should NOT be the plain token
      expect(mockDoc.meta.sessionTokenHash).not.toBe(token);
    });
  });
});
