/**
 * Integration tests for MCP tools registry.
 *
 * Verifies all 14 tools are properly registered.
 * @see docs/whips/daemon-mcp-server-merge.md#mcp-tools
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { McpServer, ToolHandler, ToolInputSchema } from '../index.js';
import { registerTools } from './index.js';

/**
 * Expected tool names from architecture doc:
 * execute_code, create_task, read_task, update_task, add_artifact,
 * complete_task, link_pr, post_update, read_diff_comments,
 * reply_to_diff_comment, reply_to_thread_comment, update_block_content,
 * regenerate_session_token, setup_review_notification
 */

function createMockServer(): McpServer & {
  registeredTools: Map<
    string,
    { description: string; schema: ToolInputSchema; handler: ToolHandler }
  >;
} {
  const registeredTools = new Map<
    string,
    { description: string; schema: ToolInputSchema; handler: ToolHandler }
  >();

  return {
    registeredTools,
    tool: vi.fn(
      (name: string, description: string, schema: ToolInputSchema, handler: ToolHandler) => {
        registeredTools.set(name, { description, schema, handler });
      }
    ),
    connect: vi.fn(),
    getSdkServer: vi.fn(),
  } as McpServer & {
    registeredTools: Map<
      string,
      { description: string; schema: ToolInputSchema; handler: ToolHandler }
    >;
  };
}

describe('MCP Tools Registry', () => {
  describe('registerTools', () => {
    it('registers all 14 MCP tools', () => {
      const server = createMockServer();

      registerTools(server);

      expect(server.registeredTools.size).toBe(14);
    });

    it('each tool has proper schema validation with type object', () => {
      const server = createMockServer();

      registerTools(server);

      for (const [_name, tool] of server.registeredTools) {
        expect(tool.schema).toBeDefined();
        expect(typeof tool.schema).toBe('object');
        expect(tool.description).toBeDefined();
        expect(tool.description.length).toBeGreaterThan(0);
        expect(typeof tool.handler).toBe('function');
      }
    });

    it('no duplicate tool names', () => {
      const server = createMockServer();

      registerTools(server);

      const names = Array.from(server.registeredTools.keys());
      const uniqueNames = new Set(names);
      expect(names.length).toBe(uniqueNames.size);
    });
  });

  describe('tool availability', () => {
    let server: ReturnType<typeof createMockServer>;

    beforeEach(() => {
      server = createMockServer();
      registerTools(server);
    });

    it('execute_code is registered', () => {
      expect(server.registeredTools.has('execute_code')).toBe(true);
      const tool = server.registeredTools.get('execute_code');
      expect(tool?.schema).toHaveProperty('code');
    });

    it('create_task is registered', () => {
      expect(server.registeredTools.has('create_task')).toBe(true);
      const tool = server.registeredTools.get('create_task');
      expect(tool?.schema).toHaveProperty('title');
      expect(tool?.schema).toHaveProperty('content');
    });

    it('read_task is registered', () => {
      expect(server.registeredTools.has('read_task')).toBe(true);
      const tool = server.registeredTools.get('read_task');
      expect(tool?.schema).toHaveProperty('taskId');
      expect(tool?.schema).toHaveProperty('sessionToken');
    });

    it('update_task is registered', () => {
      expect(server.registeredTools.has('update_task')).toBe(true);
      const tool = server.registeredTools.get('update_task');
      expect(tool?.schema).toHaveProperty('taskId');
      expect(tool?.schema).toHaveProperty('sessionToken');
    });

    it('add_artifact is registered', () => {
      expect(server.registeredTools.has('add_artifact')).toBe(true);
      const tool = server.registeredTools.get('add_artifact');
      expect(tool?.schema).toHaveProperty('taskId');
      expect(tool?.schema).toHaveProperty('type');
      expect(tool?.schema).toHaveProperty('filename');
    });

    it('complete_task is registered', () => {
      expect(server.registeredTools.has('complete_task')).toBe(true);
      const tool = server.registeredTools.get('complete_task');
      expect(tool?.schema).toHaveProperty('taskId');
      expect(tool?.schema).toHaveProperty('sessionToken');
    });

    it('link_pr is registered', () => {
      expect(server.registeredTools.has('link_pr')).toBe(true);
      const tool = server.registeredTools.get('link_pr');
      expect(tool?.schema).toHaveProperty('taskId');
      expect(tool?.schema).toHaveProperty('prNumber');
    });

    it('post_update is registered', () => {
      expect(server.registeredTools.has('post_update')).toBe(true);
      const tool = server.registeredTools.get('post_update');
      expect(tool?.schema).toHaveProperty('taskId');
      expect(tool?.schema).toHaveProperty('message');
    });

    it('read_diff_comments is registered', () => {
      expect(server.registeredTools.has('read_diff_comments')).toBe(true);
      const tool = server.registeredTools.get('read_diff_comments');
      expect(tool?.schema).toHaveProperty('taskId');
      expect(tool?.schema).toHaveProperty('sessionToken');
    });

    it('reply_to_diff_comment is registered', () => {
      expect(server.registeredTools.has('reply_to_diff_comment')).toBe(true);
      const tool = server.registeredTools.get('reply_to_diff_comment');
      expect(tool?.schema).toHaveProperty('taskId');
      expect(tool?.schema).toHaveProperty('commentId');
    });

    it('reply_to_thread_comment is registered', () => {
      expect(server.registeredTools.has('reply_to_thread_comment')).toBe(true);
      const tool = server.registeredTools.get('reply_to_thread_comment');
      expect(tool?.schema).toHaveProperty('taskId');
      expect(tool?.schema).toHaveProperty('threadId');
    });

    it('update_block_content is registered', () => {
      expect(server.registeredTools.has('update_block_content')).toBe(true);
      const tool = server.registeredTools.get('update_block_content');
      expect(tool?.schema).toHaveProperty('taskId');
      expect(tool?.schema).toHaveProperty('operations');
    });

    it('regenerate_session_token is registered', () => {
      expect(server.registeredTools.has('regenerate_session_token')).toBe(true);
      const tool = server.registeredTools.get('regenerate_session_token');
      expect(tool?.schema).toHaveProperty('taskId');
    });

    it('setup_review_notification is registered', () => {
      expect(server.registeredTools.has('setup_review_notification')).toBe(true);
      const tool = server.registeredTools.get('setup_review_notification');
      expect(tool?.schema).toHaveProperty('taskId');
    });
  });
});
