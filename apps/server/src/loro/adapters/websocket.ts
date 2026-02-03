/**
 * WebSocket network adapter for Loro sync.
 *
 * Thin wrapper around @loro-extended/adapter-websocket.
 * Handles hook client connections for Loro document sync.
 * @see docs/whips/daemon-mcp-server-merge.md#4-use-loro-extended-adapters
 */

import {
	WsServerNetworkAdapter,
	wrapWsSocket,
} from "@loro-extended/adapter-websocket/server";
import type { PeerID } from "@loro-extended/repo";
import type { WebSocket, WebSocketServer } from "ws";
import { logger } from "../../utils/logger.js";

export { WsServerNetworkAdapter, wrapWsSocket };

/**
 * Create a WebSocket adapter for Loro sync and attach it to a WebSocket server.
 * Handles incoming connections and wraps them for loro-extended.
 */
export function createWebSocketAdapter(
	wss: WebSocketServer,
): WsServerNetworkAdapter {
	const adapter = new WsServerNetworkAdapter();

	wss.on("connection", (ws: WebSocket, req) => {
		const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
		const peerIdParam = url.searchParams.get("peerId");
		// eslint-disable-next-line no-restricted-syntax
		const peerId: PeerID | null =
			peerIdParam && /^(0|[1-9]\d*)$/.test(peerIdParam)
				? // eslint-disable-next-line no-restricted-syntax
					(peerIdParam as PeerID)
				: null;

		logger.debug({ peerId, url: req.url }, "WebSocket connection attempt");

		try {
			const { connection, start } = adapter.handleConnection({
				socket: wrapWsSocket(ws),
				peerId: peerId ?? undefined,
			});

			logger.info(
				{ peerId: connection.peerId, channelId: connection.channelId },
				"WebSocket client connected",
			);

			start();
		} catch (error) {
			logger.error(
				{ error, peerId, url: req.url },
				"Failed to handle WebSocket connection",
			);
			ws.close(1011, "Internal error handling connection");
		}
	});

	return adapter;
}
