#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
	CallToolRequestSchema,
	ErrorCode,
	ListToolsRequestSchema,
	McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { registryConfig } from "./config/env/registry.js";
import { ensureDaemonRunning } from "./daemon-launcher.js";
import { initAsClient, initAsHub } from "./doc-store.js";
import { logger } from "./logger.js";
import { setClientInfo } from "./mcp-client-info.js";
import {
	isRegistryRunning,
	releaseHubLock,
	startRegistryServer,
	tryAcquireHubLock,
} from "./registry-server.js";
import { executeCodeTool } from "./tools/execute-code.js";
import { TOOL_NAMES } from "./tools/tool-names.js";

/**
 * Determine if we're the Registry Hub or a client.
 * Respects SHIPYARD_MODE and REGISTRY_HUB_URL environment variables.
 */
const mode = registryConfig.SHIPYARD_MODE;
const explicitHubUrl = registryConfig.REGISTRY_HUB_URL;

if (mode === "client" || explicitHubUrl) {
	/** FORCE client mode - connect to existing hub */
	let hubPort: number | null = null;

	if (explicitHubUrl) {
		/** Extract port from explicit URL */
		try {
			const url = new URL(explicitHubUrl);
			hubPort = Number.parseInt(url.port || "32191", 10);
			logger.info(
				{ hubUrl: explicitHubUrl, hubPort },
				"Using explicit hub URL (client mode)",
			);
		} catch (err) {
			logger.error({ hubUrl: explicitHubUrl, err }, "Invalid REGISTRY_HUB_URL");
			process.exit(1);
		}
	} else {
		/** Discover hub via HTTP health check */
		hubPort = await isRegistryRunning();
		if (!hubPort) {
			logger.error(
				"SHIPYARD_MODE=client but no hub found on ports 32191-32199",
			);
			process.exit(1);
		}
	}

	logger.info(
		{ registryPort: hubPort },
		"Connecting to registry hub as client",
	);
	await initAsClient(hubPort);
} else if (mode === "hub") {
	/** FORCE hub mode - become hub regardless */
	const acquired = await tryAcquireHubLock();
	if (!acquired) {
		logger.error(
			"SHIPYARD_MODE=hub but could not acquire lock (another hub running?)",
		);
		process.exit(1);
	}

	logger.info("Acquired hub lock, starting registry hub");
	const hubPort = await startRegistryServer();
	if (!hubPort) {
		await releaseHubLock();
		logger.error("Failed to start registry hub - all ports in use");
		process.exit(1);
	}

	initAsHub();
	logger.info({ hubPort }, "Registry hub started successfully");
} else {
	/** AUTO mode - detect based on existing hub or lock file */
	const registryPort = await isRegistryRunning();
	if (!registryPort) {
		/** No hub running - try to acquire lock and become hub */
		const acquired = await tryAcquireHubLock();
		if (acquired) {
			/** We got the lock - become the hub */
			logger.info("Acquired hub lock, starting registry hub");
			const hubPort = await startRegistryServer();
			if (!hubPort) {
				await releaseHubLock();
				logger.error("Failed to start registry hub - all ports in use");
				process.exit(1);
			}
			/** Hub mode: run our own WebSocket server for Y.Doc sync */
			initAsHub();
			logger.info({ hubPort }, "Registry hub started successfully");
		} else {
			/** Another process holds the lock - wait and become client */
			logger.info("Hub lock held by another process, waiting to become client");
			await new Promise((resolve) => setTimeout(resolve, 2000));

			const port = await isRegistryRunning();
			if (port) {
				logger.info(
					{ registryPort: port },
					"Connecting to registry hub as client",
				);
				await initAsClient(port);
			} else {
				logger.error(
					"Failed to find running hub after lock acquisition failed",
				);
				process.exit(1);
			}
		}
	} else {
		/** Hub already running - connect as client */
		logger.info({ registryPort }, "Connecting to registry hub as client");
		await initAsClient(registryPort);
	}
}

/** Ensure agent launcher daemon is running (self-propagating bootstrap) */
await ensureDaemonRunning();

const server = new Server(
	{
		name: "shipyard",
		version: "0.1.0",
		description:
			"Your agent management hub - the central interface where humans manage AI agents. Plans, artifacts, feedback, and all human-agent communication happen here.",
	},
	{
		capabilities: {
			tools: {},
		},
		instructions: `IMPORTANT: When working with Shipyard, use requestUserInput() inside ${TOOL_NAMES.EXECUTE_CODE} for ALL human interaction instead of platform-specific question tools (AskUserQuestion, etc.). The human is in the browser viewing your plan - that's where they expect to interact with you.`,
	},
);

/**
 * Only expose execute_code - all Shipyard APIs are available through the sandbox
 * This prevents bypassing the sandbox and ensures consistent API access
 */
server.setRequestHandler(ListToolsRequestSchema, async () => ({
	tools: [executeCodeTool.definition],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
	/** Capture clientInfo on first tool call (handshake is complete by now) */
	const clientInfo = server.getClientVersion();
	if (clientInfo?.name) {
		setClientInfo(clientInfo.name);
		logger.info(
			{ clientName: clientInfo.name, clientVersion: clientInfo.version },
			"MCP client info captured from tool call",
		);
	}

	const { name, arguments: args } = request.params;

	if (name === TOOL_NAMES.EXECUTE_CODE) {
		return await executeCodeTool.handler(args ?? {});
	}

	throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
});

const transport = new StdioServerTransport();
await server.connect(transport);

logger.info("MCP server started");
