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
import {
  isRegistryRunning,
  releaseHubLock,
  startRegistryServer,
  tryAcquireHubLock,
} from './registry-server.js';
import { executeCodeTool } from './tools/execute-code.js';
import { readDiffCommentsTool } from './tools/read-diff-comments.js';
import { requestUserInputTool } from './tools/request-user-input.js';
import { TOOL_NAMES } from './tools/tool-names.js';

// Determine if we're the Registry Hub or a client
const registryPort = await isRegistryRunning();
if (!registryPort) {
  // No hub running - try to acquire lock and become hub
  const acquired = await tryAcquireHubLock();
  if (acquired) {
    // We got the lock - become the hub
    logger.info('Acquired hub lock, starting registry hub');
    const hubPort = await startRegistryServer();
    if (!hubPort) {
      await releaseHubLock(); // Release on failure
      logger.error('Failed to start registry hub - all ports in use');
      process.exit(1);
    }
    // Hub mode: run our own WebSocket server for Y.Doc sync
    initAsHub();
    logger.info({ hubPort }, 'Registry hub started successfully');
  } else {
    // Another process holds the lock - wait and become client
    logger.info('Hub lock held by another process, waiting to become client');
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const port = await isRegistryRunning();
    if (port) {
      logger.info({ registryPort: port }, 'Connecting to registry hub as client');
      await initAsClient(port);
    } else {
      logger.error('Failed to find running hub after lock acquisition failed');
      process.exit(1);
    }
  }
} else {
  // Hub already running - connect as client
  logger.info({ registryPort }, 'Connecting to registry hub as client');
  await initAsClient(registryPort);
}

const server = new Server(
  {
    name: 'shipyard',
    version: '0.1.0',
    description:
      'Your agent management hub - the central interface where humans manage AI agents. Plans, artifacts, feedback, and all human-agent communication happen here.',
  },
  {
    capabilities: {
      tools: {},
    },
    // Instructions shown to clients during initialization
    instructions: `IMPORTANT: When working with Shipyard, use ${TOOL_NAMES.REQUEST_USER_INPUT} for ALL human interaction instead of platform-specific question tools (AskUserQuestion, etc.). The human is in the browser viewing your plan - that's where they expect to interact with you.`,
  }
);

// Expose execute_code (bundled APIs), request_user_input (standalone), and read_diff_comments
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    executeCodeTool.definition,
    requestUserInputTool.definition,
    readDiffCommentsTool.definition,
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === TOOL_NAMES.EXECUTE_CODE) {
    return await executeCodeTool.handler(args ?? {});
  }

  if (name === TOOL_NAMES.REQUEST_USER_INPUT) {
    return await requestUserInputTool.handler(args ?? {});
  }

  if (name === TOOL_NAMES.READ_DIFF_COMMENTS) {
    return await readDiffCommentsTool.handler(args ?? {});
  }

  throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
});

const transport = new StdioServerTransport();
await server.connect(transport);

logger.info('MCP server started');
