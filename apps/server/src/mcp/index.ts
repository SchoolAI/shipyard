import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { getLogger } from '../utils/logger.js';
import { registerTools } from './tools/index.js';

export type ToolHandler = (args: unknown) => Promise<{
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}>;

export interface ToolInputSchemaProperty {
  type: string;
  description?: string;
  enum?: readonly string[];
  items?: ToolInputSchemaProperty;
  nullable?: boolean;
  properties?: Record<string, ToolInputSchemaProperty>;
  required?: readonly string[];
}

export interface ToolInputSchema {
  [key: string]: ToolInputSchemaProperty;
}

interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: ToolInputSchema;
    required?: string[];
  };
}

interface ToolRegistry {
  definitions: Map<string, ToolDefinition>;
  handlers: Map<string, ToolHandler>;
}

export interface McpServer {
  tool(name: string, description: string, inputSchema: ToolInputSchema, handler: ToolHandler): void;
  connect(transport: WebStandardStreamableHTTPServerTransport): Promise<void>;
  getSdkServer(): Server;
}

let mcpServer: McpServer | null = null;
let mcpTransport: WebStandardStreamableHTTPServerTransport | null = null;

export function createMcpServer(): McpServer {
  const log = getLogger();

  const sdkServer = new Server(
    {
      name: 'shipyard',
      version: '0.1.0',
    },
    {
      capabilities: {
        tools: {},
      },
      instructions: `IMPORTANT: When working with Shipyard, use requestUserInput() inside execute_code for ALL human interaction instead of platform-specific question tools (AskUserQuestion, etc.). The human is in the browser viewing your plan - that's where they expect to interact with you.`,
    }
  );

  const registry: ToolRegistry = {
    definitions: new Map(),
    handlers: new Map(),
  };

  const server: McpServer = {
    tool(
      name: string,
      description: string,
      inputSchema: ToolInputSchema,
      handler: ToolHandler
    ): void {
      log.debug({ name }, 'Registering tool');

      registry.definitions.set(name, {
        name,
        description,
        inputSchema: {
          type: 'object',
          properties: inputSchema,
        },
      });
      registry.handlers.set(name, handler);
    },

    async connect(transport: WebStandardStreamableHTTPServerTransport): Promise<void> {
      await sdkServer.connect(transport);
    },

    getSdkServer(): Server {
      return sdkServer;
    },
  };

  registerTools(server);
  log.info({ toolCount: registry.definitions.size }, 'Tools registered');

  sdkServer.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: Array.from(registry.definitions.values()),
  }));

  sdkServer.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    const handler = registry.handlers.get(name);
    if (!handler) {
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }

    log.info({ tool: name }, 'Executing tool');

    try {
      return await handler(args ?? {});
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error occurred';
      log.error({ tool: name, error: message }, 'Tool execution failed');

      return {
        content: [{ type: 'text', text: `Error: ${message}` }],
        isError: true,
      };
    }
  });

  return server;
}

export function initMcpServer(): void {
  const log = getLogger();

  if (mcpServer !== null) {
    log.warn('MCP server already initialized');
    return;
  }

  mcpServer = createMcpServer();
  mcpTransport = new WebStandardStreamableHTTPServerTransport({
    enableJsonResponse: true,
  });

  mcpServer.connect(mcpTransport).then(() => {
    log.info('MCP server connected to HTTP transport');
  });
}

export function getMcpServer(): McpServer {
  if (mcpServer === null) {
    throw new Error('MCP server not initialized - call initMcpServer() first');
  }
  return mcpServer;
}

export function getMcpTransport(): WebStandardStreamableHTTPServerTransport | null {
  return mcpTransport;
}

export function resetMcpServer(): void {
  mcpServer = null;
  mcpTransport = null;
}
