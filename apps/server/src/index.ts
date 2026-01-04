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
import { addArtifactTool } from './tools/add-artifact.js';
import { createPlanTool } from './tools/create-plan.js';
import { listPlansTool } from './tools/list-plans.js';
import { readPlanTool } from './tools/read-plan.js';
import { updatePlanTool } from './tools/update-plan.js';
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

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    addArtifactTool.definition,
    createPlanTool.definition,
    listPlansTool.definition,
    readPlanTool.definition,
    updatePlanTool.definition,
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case 'add_artifact':
      return await addArtifactTool.handler(args ?? {});
    case 'create_plan':
      return await createPlanTool.handler(args ?? {});
    case 'list_plans':
      return await listPlansTool.handler(args ?? {});
    case 'read_plan':
      return await readPlanTool.handler(args ?? {});
    case 'update_plan':
      return await updatePlanTool.handler(args ?? {});
    default: {
      const _exhaustiveCheck: never = name as never;
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${_exhaustiveCheck}`);
    }
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);

logger.info('MCP server started');
