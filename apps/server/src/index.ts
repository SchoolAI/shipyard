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
import { addPRReviewCommentTool } from './tools/add-pr-review-comment.js';
import { completeTaskTool } from './tools/complete-task.js';
import { createPlanTool } from './tools/create-plan.js';
import { executeCodeTool } from './tools/execute-code.js';
import { readPlanTool } from './tools/read-plan.js';
import { setupReviewNotificationTool } from './tools/setup-review-notification.js';
import { TOOL_NAMES } from './tools/tool-names.js';
import { updateBlockContentTool } from './tools/update-block-content.js';
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
    addPRReviewCommentTool.definition,
    completeTaskTool.definition,
    createPlanTool.definition,
    executeCodeTool.definition,
    readPlanTool.definition,
    setupReviewNotificationTool.definition,
    updateBlockContentTool.definition,
    updatePlanTool.definition,
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case TOOL_NAMES.ADD_ARTIFACT:
      return await addArtifactTool.handler(args ?? {});
    case TOOL_NAMES.ADD_PR_REVIEW_COMMENT:
      return await addPRReviewCommentTool.handler(args ?? {});
    case TOOL_NAMES.COMPLETE_TASK:
      return await completeTaskTool.handler(args ?? {});
    case TOOL_NAMES.CREATE_PLAN:
      return await createPlanTool.handler(args ?? {});
    case TOOL_NAMES.EXECUTE_CODE:
      return await executeCodeTool.handler(args ?? {});
    case TOOL_NAMES.READ_PLAN:
      return await readPlanTool.handler(args ?? {});
    case TOOL_NAMES.SETUP_REVIEW_NOTIFICATION:
      return await setupReviewNotificationTool.handler(args ?? {});
    case TOOL_NAMES.UPDATE_BLOCK_CONTENT:
      return await updateBlockContentTool.handler(args ?? {});
    case TOOL_NAMES.UPDATE_PLAN:
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
