#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { initAsClient, initAsHub } from './doc-store.js';
import { logger } from './logger.js';
import { isRegistryRunning, startRegistryServer } from './registry-server.js';
import { executeCodeTool } from './tools/execute-code.js';
import { TOOL_NAMES } from './tools/tool-names.js';

// Determine if we're the Registry Hub or a client
const registryPort = await isRegistryRunning();
if (!registryPort) {
  // This instance becomes the Registry Hub
  logger.info('Starting registry hub');
  const hubPort = await startRegistryServer();
  if (!hubPort) {
    logger.error('Failed to start registry hub - all ports in use');
    process.exit(1);
  }
  // Hub mode: run our own WebSocket server for Y.Doc sync
  initAsHub();
  logger.info({ hubPort }, 'Registry hub started successfully');
} else {
  // Another instance is already the Registry Hub - connect as client
  logger.info({ registryPort }, 'Connecting to registry hub as client');
  await initAsClient(registryPort);
}

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
