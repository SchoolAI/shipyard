/**
 * Loro Repo singleton.
 *
 * Creates and manages the Loro Repo with all three adapters:
 * - LevelDB storage (persistence)
 * - WebSocket server (hook client sync)
 * - WebRTC (P2P browser sync)
 *
 * @see docs/whips/daemon-mcp-server-merge.md#4-use-loro-extended-adapters
 */

import type { DocContext, PeerContext } from "@loro-extended/repo";
import { Repo } from "@loro-extended/repo";
import type { WebSocketServer } from "ws";
import { createStorageAdapter } from "./adapters/storage.js";
import {
	createWebRtcAdapter,
	type WebRtcDataChannelAdapter,
} from "./adapters/webrtc.js";
import {
	createWebSocketAdapter,
	type WsServerNetworkAdapter,
} from "./adapters/websocket.js";

export { createStorageAdapter } from "./adapters/storage.js";
export { createWebRtcAdapter } from "./adapters/webrtc.js";
export { createWebSocketAdapter } from "./adapters/websocket.js";

/** Repo instance (singleton) */
let repo: Repo | null = null;

/** WebSocket adapter instance for external access */
let wsAdapter: WsServerNetworkAdapter | null = null;

/** WebRTC adapter instance for external access */
let webrtcAdapter: WebRtcDataChannelAdapter | null = null;

/**
 * Create the Loro Repo with all adapters.
 * Should only be called once during startup.
 *
 * @param wss - WebSocket server to attach the WebSocket adapter to
 */
export function createRepo(wss: WebSocketServer): Repo {
	if (repo !== null) {
		throw new Error("Repo already created - call getRepo() instead");
	}

	const storageAdapter = createStorageAdapter();
	wsAdapter = createWebSocketAdapter(wss);
	webrtcAdapter = createWebRtcAdapter();

	repo = new Repo({
		identity: {
			name: "shipyard-daemon",
			type: "service",
		},
		adapters: [storageAdapter, wsAdapter, webrtcAdapter],
		permissions: {
			visibility(_doc: DocContext, peer: PeerContext) {
				if (peer.channelKind === "storage") return true;
				return false;
			},
		},
	});

	return repo;
}

/**
 * Get the existing Repo instance.
 * Throws if Repo hasn't been created yet.
 */
export function getRepo(): Repo {
	if (repo === null) {
		throw new Error("Repo not created - call createRepo() first");
	}
	return repo;
}

/**
 * Get the WebSocket adapter instance.
 * Throws if Repo hasn't been created yet.
 */
export function getWsAdapter(): WsServerNetworkAdapter {
	if (wsAdapter === null) {
		throw new Error("Repo not created - call createRepo() first");
	}
	return wsAdapter;
}

/**
 * Get the WebRTC adapter instance.
 * Throws if Repo hasn't been created yet.
 */
export function getWebRtcAdapter(): WebRtcDataChannelAdapter {
	if (webrtcAdapter === null) {
		throw new Error("Repo not created - call createRepo() first");
	}
	return webrtcAdapter;
}

/**
 * Reset the Repo (for testing).
 */
export function resetRepo(): void {
	if (repo !== null) {
		repo.reset();
		repo = null;
		wsAdapter = null;
		webrtcAdapter = null;
	}
}
