#!/usr/bin/env node
/**
 * Unified MCP Server + Daemon for Shipyard
 *
 * Entry point that detects mode and starts appropriate services:
 * - Launcher mode (default): Ensures daemon is running, then exits
 * - Daemon mode (--daemon): Background server with Loro sync
 *
 * Startup sequence:
 * 1. Parse CLI args (--daemon flag)
 * 2. Initialize logger
 * 3. Load environment config
 * 4. If --daemon mode:
 *    - Check/acquire daemon lock
 *    - Start WebSocket server
 *    - Create Loro Repo with adapters
 *    - Start HTTP server
 *    - Start MCP server
 *    - Setup graceful shutdown
 * 5. If launcher mode:
 *    - Check if daemon running (GET /health)
 *    - If not running: spawn daemon (detached)
 *    - Poll /health until success
 *    - Exit (daemon continues)
 *
 * @see docs/whips/daemon-mcp-server-merge.md
 */

import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { serve } from "@hono/node-server";
import { WebSocketServer } from "ws";
import { initSpawner } from "./agents/spawner.js";
import { type Env, parseEnv } from "./env.js";
import { initGitHubClient } from "./http/helpers/github.js";
import { type AppContext, createApp } from "./http/routes/index.js";
import {
	startSpawnRequestCleanup,
	stopSpawnRequestCleanup,
} from "./loro/handlers.js";
import { createRepo, resetRepo } from "./loro/repo.js";
import { startMcpServer } from "./mcp/index.js";
import { isLocked, releaseLock, tryAcquireLock } from "./utils/daemon-lock.js";
import { getLogger, initLogger } from "./utils/logger.js";
import { getStateDir } from "./utils/paths.js";

/** Parse CLI arguments */
function parseArgs(): { daemon: boolean } {
	return {
		daemon: process.argv.includes("--daemon"),
	};
}

/** Health check polling configuration */
const HEALTH_CHECK_INTERVAL_MS = 200;
const HEALTH_CHECK_MAX_ATTEMPTS = 50;
const HEALTH_CHECK_TIMEOUT_MS = 1000;

/**
 * Check if daemon is running by hitting the health endpoint.
 */
async function isDaemonRunning(port: number): Promise<boolean> {
	try {
		const controller = new AbortController();
		const timeout = setTimeout(
			() => controller.abort(),
			HEALTH_CHECK_TIMEOUT_MS,
		);

		const response = await fetch(`http://127.0.0.1:${port}/health`, {
			signal: controller.signal,
		});

		clearTimeout(timeout);

		if (!response.ok) return false;

		// eslint-disable-next-line no-restricted-syntax
		const data = (await response.json()) as { status?: string };
		return data.status === "ok";
	} catch {
		return false;
	}
}

/**
 * Poll health endpoint until daemon is ready.
 */
async function waitForDaemon(
	port: number,
	maxAttempts: number = HEALTH_CHECK_MAX_ATTEMPTS,
): Promise<boolean> {
	for (let attempt = 0; attempt < maxAttempts; attempt++) {
		if (await isDaemonRunning(port)) {
			return true;
		}
		await new Promise((resolve) =>
			setTimeout(resolve, HEALTH_CHECK_INTERVAL_MS),
		);
	}
	return false;
}

/**
 * Spawn daemon as detached background process.
 */
function spawnDaemon(): void {
	const scriptPath = process.argv[1];
	if (!scriptPath) {
		throw new Error("Cannot determine script path for daemon spawn");
	}

	const child = spawn(process.execPath, [scriptPath, "--daemon"], {
		detached: true,
		stdio: "ignore",
		env: process.env,
	});

	child.unref();
}

/**
 * Launcher mode: ensure daemon is running, then exit.
 */
async function runLauncher(env: Env): Promise<void> {
	const log = getLogger();
	const port = env.PORT;

	log.info({ port }, "Launcher mode: checking if daemon is running");

	if (await isDaemonRunning(port)) {
		log.info({ port }, "Daemon already running");
		process.exit(0);
	}

	if (isLocked()) {
		log.info("Lock held, waiting for daemon to become ready");
		const ready = await waitForDaemon(port);
		if (ready) {
			log.info({ port }, "Daemon is ready");
			process.exit(0);
		}
		log.error("Daemon failed to become ready within timeout");
		process.exit(1);
	}

	log.info("Spawning daemon process");
	spawnDaemon();

	const ready = await waitForDaemon(port);
	if (ready) {
		log.info({ port }, "Daemon started successfully");
		process.exit(0);
	}

	log.error("Daemon failed to start within timeout");
	process.exit(1);
}

/**
 * Daemon mode: start all services.
 */
async function runDaemon(env: Env): Promise<void> {
	const log = getLogger();
	const port = env.PORT;

	log.info({ port, stateDir: getStateDir() }, "Daemon mode: starting services");

	mkdirSync(getStateDir(), { recursive: true });

	const acquired = await tryAcquireLock();
	if (!acquired) {
		log.error(
			"Failed to acquire daemon lock - another instance may be running",
		);
		process.exit(1);
	}

	log.info("Daemon lock acquired");

	const startTime = Date.now();

	initGitHubClient(env);

	initSpawner(env);
	log.info("Agent spawner initialized");

	startSpawnRequestCleanup();
	log.info("Spawn request cleanup started");

	const wss = new WebSocketServer({ noServer: true });

	createRepo(wss);
	log.info("Loro Repo created with adapters");

	const appContext: AppContext = {
		health: { startTime },
		github: {
			getClient: () => null, // TODO: Return actual client when initialized
			parseRepo: (_planId: string) => null, // TODO: Parse repo from plan metadata
		},
	};
	const app = createApp(appContext);

	const server = serve({
		fetch: app.fetch,
		port,
	});

	server.on("upgrade", (request, socket, head) => {
		wss.handleUpgrade(request, socket, head, (ws) => {
			wss.emit("connection", ws, request);
		});
	});

	log.info({ port }, "HTTP server started");

	try {
		await startMcpServer();
		log.info("MCP server started");
	} catch (err) {
		log.debug({ err }, "MCP server not started (expected in daemon mode)");
	}

	const shutdown = async (signal: string) => {
		log.info({ signal }, "Received shutdown signal");

		stopSpawnRequestCleanup();
		log.debug("Spawn request cleanup stopped");

		server.close();

		wss.close();

		await new Promise((resolve) => setTimeout(resolve, 100));

		try {
			resetRepo();
			log.debug("Loro repo reset");
		} catch (err) {
			log.warn({ err }, "Error resetting Loro repo during shutdown");
		}

		await releaseLock();

		log.info("Shutdown complete");
		process.exit(0);
	};

	process.on("SIGTERM", () => shutdown("SIGTERM"));
	process.on("SIGINT", () => shutdown("SIGINT"));

	process.on("uncaughtException", async (err) => {
		log.error({ err }, "Uncaught exception");
		stopSpawnRequestCleanup();
		try {
			resetRepo();
		} catch {}
		await releaseLock();
		process.exit(1);
	});

	process.on("unhandledRejection", async (reason) => {
		log.error({ reason }, "Unhandled rejection");
		stopSpawnRequestCleanup();
		try {
			resetRepo();
		} catch {}
		await releaseLock();
		process.exit(1);
	});

	log.info({ port }, "Daemon running");
}

/**
 * Main entry point.
 */
export async function main(): Promise<void> {
	const args = parseArgs();

	const env = parseEnv();

	initLogger(env);
	const log = getLogger();

	log.info(
		{ mode: args.daemon ? "daemon" : "launcher" },
		"Shipyard server starting",
	);

	if (args.daemon) {
		await runDaemon(env);
	} else {
		await runLauncher(env);
	}
}

main().catch((err) => {
	console.error("Fatal error:", err);
	process.exit(1);
});
