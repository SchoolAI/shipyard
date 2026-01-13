#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { logger } from './logger.js';
import { isRegistryRunning, startRegistryServer } from './registry-server.js';
import { executeCodeTool } from './tools/execute-code.js';
import { TOOL_NAMES } from './tools/tool-names.js';
import { startWebSocketServer } from './ws-server.js';

// Start registry server if not already running (singleton)
const registryPort = await isRegistryRunning();
if (!registryPort) {
  logger.info('Starting registry server');
  await startRegistryServer();
} else {
  logger.info({ registryPort }, 'Registry server already running');
}

// Start WebSocket server for Yjs sync (runs alongside MCP)
startWebSocketServer();

const server = new Server(
  {
    name: 'peer-plan',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Only expose execute_code - all other APIs available through it
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [executeCodeTool.definition],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === TOOL_NAMES.EXECUTE_CODE) {
    return await executeCodeTool.handler(args ?? {});
  }

  throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
});

const transport = new StdioServerTransport();
await server.connect(transport);

logger.info('MCP server started');
