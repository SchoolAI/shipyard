/**
 * MCP stdio server setup.
 *
 * Configures the Model Context Protocol server with Shipyard tools.
 * Handles stdio transport to Claude Code.
 */

// TODO: Import from @modelcontextprotocol/sdk
// import { Server } from '@modelcontextprotocol/sdk/server/index.js'
// import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

// TODO: Import tools
// import { registerTools } from './tools/index.js'

/**
 * MCP tool handler function signature.
 */
export type ToolHandler = (args: unknown) => Promise<{
	content: Array<{ type: string; text: string }>;
	isError?: boolean;
}>;

/**
 * MCP tool input schema property definition.
 * Supports JSON Schema-like property definitions.
 */
export interface ToolInputSchemaProperty {
	type: string;
	description?: string;
	enum?: readonly string[];
	items?: ToolInputSchemaProperty;
	nullable?: boolean;
	properties?: Record<string, ToolInputSchemaProperty>;
	required?: readonly string[];
}

/**
 * MCP tool input schema definition.
 */
export interface ToolInputSchema {
	[key: string]: ToolInputSchemaProperty;
}

/**
 * MCP Server instance type.
 * Follows the pattern from @modelcontextprotocol/sdk where tools are registered
 * with definitions and handlers.
 */
export interface McpServer {
	/**
	 * Register a tool with the MCP server.
	 * @param name - Unique tool name
	 * @param description - Tool description for LLM
	 * @param inputSchema - JSON schema for tool inputs
	 * @param handler - Async function to handle tool calls
	 */
	tool(
		name: string,
		description: string,
		inputSchema: ToolInputSchema,
		handler: ToolHandler,
	): void;

	start(): Promise<void>;
	stop(): Promise<void>;
}

/**
 * Create and configure the MCP server with all Shipyard tools.
 */
export function createMcpServer(): McpServer {
	// TODO: Implement MCP server setup
	// const server = new Server({ name: 'shipyard', version: '0.1.0' })
	// registerTools(server)
	// return server
	throw new Error("Not implemented");
}

/**
 * Start the MCP server with stdio transport.
 * Called when running in MCP mode (not daemon mode).
 */
export async function startMcpServer(): Promise<void> {
	// TODO: Implement MCP startup
	// const server = createMcpServer()
	// const transport = new StdioServerTransport()
	// await server.connect(transport)
	throw new Error("Not implemented");
}
