/**
 * Health check endpoint.
 *
 * GET /health - Returns daemon health status for MCP startup validation.
 */

import type { Request, Response } from "express";

/** Daemon start time for uptime calculation */
let startTime: number | null = null;

/**
 * Initialize the health route with the daemon start time.
 */
export function initHealth(): void {
	startTime = Date.now();
}

/**
 * Health check handler.
 *
 * Response 200: { status: 'ok', uptime: number }
 * Response 503: { status: 'error', message: string }
 */
export function healthRoute(_req: Request, res: Response): void {
	if (startTime === null) {
		res.status(503).json({
			status: "error",
			message: "Server not initialized",
		});
		return;
	}

	res.json({
		status: "ok",
		uptime: Date.now() - startTime,
	});
}
