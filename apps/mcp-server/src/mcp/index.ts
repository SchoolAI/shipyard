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
 * MCP Server instance type (placeholder).
 */
export interface McpServer {
	// TODO: Define based on MCP SDK
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
