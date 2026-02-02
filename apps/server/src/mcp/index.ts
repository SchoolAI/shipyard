/**
 * MCP stdio server setup.
 *
 * Configures the Model Context Protocol server with Shipyard tools.
 * Handles stdio transport to Claude Code.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
	CallToolRequestSchema,
	ErrorCode,
	ListToolsRequestSchema,
	McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { getLogger } from "../utils/logger.js";
import { registerTools } from "./tools/index.js";

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
 * Tool definition stored internally.
 */
interface ToolDefinition {
	name: string;
	description: string;
	inputSchema: {
		type: "object";
		properties: ToolInputSchema;
		required?: string[];
	};
}

/**
 * Internal tool registry.
 */
interface ToolRegistry {
	definitions: Map<string, ToolDefinition>;
	handlers: Map<string, ToolHandler>;
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

	/** Connect to transport and start handling requests */
	connect(transport: StdioServerTransport): Promise<void>;

	/** Get the underlying MCP SDK server */
	getSdkServer(): Server;
}

/**
 * Create and configure the MCP server with all Shipyard tools.
 */
export function createMcpServer(): McpServer {
	const log = getLogger();

	/** Create the MCP SDK server */
	const sdkServer = new Server(
		{
			name: "shipyard",
			version: "0.1.0",
		},
		{
			capabilities: {
				tools: {},
			},
			instructions: `IMPORTANT: When working with Shipyard, use requestUserInput() inside execute_code for ALL human interaction instead of platform-specific question tools (AskUserQuestion, etc.). The human is in the browser viewing your plan - that's where they expect to interact with you.`,
		},
	);

	/** Tool registry for definitions and handlers */
	const registry: ToolRegistry = {
		definitions: new Map(),
		handlers: new Map(),
	};

	/** McpServer wrapper that exposes tool() registration */
	const server: McpServer = {
		tool(
			name: string,
			description: string,
			inputSchema: ToolInputSchema,
			handler: ToolHandler,
		): void {
			log.debug({ name }, "Registering tool");

			registry.definitions.set(name, {
				name,
				description,
				inputSchema: {
					type: "object",
					properties: inputSchema,
				},
			});
			registry.handlers.set(name, handler);
		},

		async connect(transport: StdioServerTransport): Promise<void> {
			await sdkServer.connect(transport);
		},

		getSdkServer(): Server {
			return sdkServer;
		},
	};

	/** Register all tools */
	registerTools(server);
	log.info({ toolCount: registry.definitions.size }, "Tools registered");

	/** Handle list tools request */
	sdkServer.setRequestHandler(ListToolsRequestSchema, async () => ({
		tools: Array.from(registry.definitions.values()),
	}));

	/** Handle call tool request */
	sdkServer.setRequestHandler(CallToolRequestSchema, async (request) => {
		const { name, arguments: args } = request.params;

		const handler = registry.handlers.get(name);
		if (!handler) {
			throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
		}

		log.info({ tool: name }, "Executing tool");

		try {
			return await handler(args ?? {});
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Unknown error occurred";
			log.error({ tool: name, error: message }, "Tool execution failed");

			return {
				content: [{ type: "text", text: `Error: ${message}` }],
				isError: true,
			};
		}
	});

	return server;
}

/**
 * Start the MCP server with stdio transport.
 * Called when running in MCP mode (not daemon mode).
 */
export async function startMcpServer(): Promise<void> {
	const log = getLogger();

	log.info("Starting MCP server with stdio transport");

	const server = createMcpServer();
	const transport = new StdioServerTransport();

	await server.connect(transport);

	log.info("MCP server connected to stdio transport");
}
