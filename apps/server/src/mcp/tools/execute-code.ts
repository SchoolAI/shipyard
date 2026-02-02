/**
 * MCP Tool: execute_code
 *
 * Executes JavaScript code in a sandboxed VM with access to task APIs.
 * This is the main tool agents use to interact with the task document.
 *
 * @see docs/whips/daemon-mcp-server-merge.md#mcp-tools
 */

import type { McpServer } from "../index.js";

/**
 * Register the execute_code tool.
 */
export function registerExecuteCodeTool(_server: McpServer): void {
	// TODO: Implement using sandbox/index.ts
	throw new Error("Not implemented");
}
