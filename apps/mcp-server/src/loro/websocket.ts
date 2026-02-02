/**
 * WebSocket network adapter for Loro sync.
 *
 * Thin wrapper around @loro-extended/adapter-websocket.
 * Handles hook client connections for Loro document sync.
 * @see docs/whips/daemon-mcp-server-merge.md#4-use-loro-extended-adapters
 */

// TODO: Import from @loro-extended/adapter-websocket/server
// import { WsServerNetworkAdapter } from '@loro-extended/adapter-websocket/server'

import type { WebSocketServer } from "ws";

/**
 * WebSocket adapter interface (placeholder until loro-extended types available).
 */
export interface WebSocketAdapter {
	// TODO: Define based on loro-extended adapter interface
	handleConnection(ws: unknown): void;
}

/**
 * Create a WebSocket adapter for Loro sync.
 */
export function createWebSocketAdapter(
	_wss: WebSocketServer,
): WebSocketAdapter {
	// TODO: Implement using WsServerNetworkAdapter
	// const adapter = new WsServerNetworkAdapter()
	// wss.on('connection', ws => adapter.handleConnection({ socket: wrapWsSocket(ws) }))
	// return adapter
	throw new Error("Not implemented");
}
