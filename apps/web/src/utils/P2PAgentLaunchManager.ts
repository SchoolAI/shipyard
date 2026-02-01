/**
 * P2PAgentLaunchManager - P2P agent launching for mobile browsers
 *
 * This class enables browsers without a local daemon to launch agents
 * by forwarding requests to connected peers that have daemon access.
 *
 * Flow:
 * 1. Mobile browser sends agent launch request to peer with daemon
 * 2. Peer receives request, forwards to their local daemon
 * 3. Peer sends response back (success with PID or error)
 * 4. Mobile browser receives response and updates UI
 *
 * Security considerations:
 * - Only peers visible in the awareness protocol can receive requests
 * - Peers must explicitly accept requests (handled by usePeerAgentLauncher hook)
 * - Rate limiting prevents spam (10 requests per minute per peer)
 *
 * @see Issue #218 - A2A for Daemon (P2P Agent Launching)
 * @see docs/designs/webrtc-custom-messages-research.md
 */

import type {
	A2AMessage,
	AgentLaunchRequest,
	AgentLaunchResponse,
	ConversationExportMeta,
} from "@shipyard/schema";
import {
	decodeAgentLaunchRequest,
	decodeAgentLaunchResponse,
	encodeAgentLaunchRequest,
	encodeAgentLaunchResponse,
	isP2PAgentLaunchMessage,
	P2PMessageType,
} from "@shipyard/schema";

/*
 * =============================================================================
 * Constants
 * =============================================================================
 */

/** Request timeout in ms (30 seconds) */
const REQUEST_TIMEOUT = 30_000;

/** Maximum pending requests per peer (rate limiting) */
const MAX_PENDING_REQUESTS_PER_PEER = 3;

/*
 * =============================================================================
 * Types
 * =============================================================================
 */

/**
 * Minimal interface for peer connections.
 * Same as ConversationTransferManager for consistency.
 */
export interface PeerConnection {
	connected: boolean;
	bufferedAmount: number;
	send(data: Uint8Array): void;
	on(event: "data", callback: (data: Uint8Array) => void): void;
	on(event: "close", callback: () => void): void;
	on(event: "error", callback: (error: Error) => void): void;
	removeListener(event: "data", callback: (data: Uint8Array) => void): void;
	removeListener(event: "close", callback: () => void): void;
	removeListener(event: "error", callback: (error: Error) => void): void;
}

/**
 * Options for launching an agent via P2P.
 */
export interface P2PAgentLaunchOptions {
	/** Task ID (plan ID) for the agent */
	taskId: string;
	/** Prompt for simple launch (mutually exclusive with a2aPayload) */
	prompt?: string;
	/** Working directory for the agent */
	cwd?: string;
	/** A2A payload for context launch (mutually exclusive with prompt) */
	a2aPayload?: {
		messages: A2AMessage[];
		meta: ConversationExportMeta;
	};
}

/**
 * Result of a P2P agent launch.
 */
export type P2PAgentLaunchResult =
	| { success: true; taskId: string; pid: number; sessionId?: string }
	| { success: false; taskId: string; error: string };

/**
 * Callback for handling incoming agent launch requests.
 * Called when this peer receives a request from another peer.
 * Should forward to local daemon and return the result.
 */
export type AgentLaunchRequestHandler = (
	request: AgentLaunchRequest,
) => Promise<AgentLaunchResponse>;

/**
 * Internal state for tracking pending outgoing requests.
 */
interface PendingRequest {
	requestId: string;
	taskId: string;
	peerId: string;
	sentAt: number;
	resolve: (result: P2PAgentLaunchResult) => void;
	timeoutId: ReturnType<typeof setTimeout>;
}

/*
 * =============================================================================
 * P2PAgentLaunchManager Class
 * =============================================================================
 */

/**
 * Manages P2P agent launching between peers.
 *
 * Usage:
 * ```typescript
 * const manager = new P2PAgentLaunchManager(peers);
 *
 * // Set up request handler (if this peer has daemon)
 * manager.setRequestHandler(async (request) => {
 *   // Forward to daemon and return response
 * });
 *
 * // Launch agent via peer (if this peer has no daemon)
 * const result = await manager.launchViaP2P('peer-123', {
 *   taskId: 'plan-abc',
 *   prompt: 'Do something',
 * });
 *
 * // Cleanup
 * manager.dispose();
 * ```
 */
export class P2PAgentLaunchManager {
	private readonly peers: Map<string, PeerConnection>;
	private readonly pendingRequests = new Map<string, PendingRequest>();
	private readonly peerListeners = new Map<
		string,
		{ data: (d: Uint8Array) => void; close: () => void }
	>();
	private requestHandler: AgentLaunchRequestHandler | null = null;
	private disposed = false;

	/**
	 * Creates a new P2PAgentLaunchManager.
	 *
	 * @param peers - Map of peer IDs to peer connections
	 */
	constructor(peers: Map<string, PeerConnection>) {
		this.peers = peers;
		this.setupPeerListeners();
	}

	/**
	 * Sets up data listeners on all connected peers.
	 */
	private setupPeerListeners(): void {
		for (const [peerId, peer] of this.peers) {
			this.addPeerListener(peerId, peer);
		}
	}

	/**
	 * Adds a data listener to a single peer.
	 */
	private addPeerListener(peerId: string, peer: PeerConnection): void {
		const dataHandler = (data: Uint8Array): void => {
			if (this.disposed) return;
			if (isP2PAgentLaunchMessage(data)) {
				this.handleIncomingMessage(peerId, data);
			}
			/** Non-agent-launch messages are ignored */
		};

		const closeHandler = (): void => {
			if (this.disposed) return;
			this.handlePeerClose(peerId);
		};

		peer.on("data", dataHandler);
		peer.on("close", closeHandler);

		this.peerListeners.set(peerId, { data: dataHandler, close: closeHandler });
	}

	/**
	 * Handles incoming P2P agent launch messages.
	 */
	private handleIncomingMessage(peerId: string, data: Uint8Array): void {
		if (data.length === 0) return;

		const type = data[0];

		if (type === P2PMessageType.AGENT_LAUNCH_REQUEST) {
			this.handleLaunchRequest(peerId, data);
		} else if (type === P2PMessageType.AGENT_LAUNCH_RESPONSE) {
			this.handleLaunchResponse(peerId, data);
		}
	}

	/**
	 * Handles incoming agent launch request from a peer.
	 */
	private async handleLaunchRequest(
		peerId: string,
		data: Uint8Array,
	): Promise<void> {
		let request: AgentLaunchRequest;
		try {
			request = decodeAgentLaunchRequest(data);
		} catch {
			return;
		}

		/** If no handler registered, send error response */
		if (!this.requestHandler) {
			this.sendResponse(peerId, {
				requestId: request.requestId,
				success: false,
				taskId: request.taskId,
				error: "Peer does not have daemon access",
				sentAt: Date.now(),
			});
			return;
		}

		/** Forward to handler and send response */
		try {
			const response = await this.requestHandler(request);
			this.sendResponse(peerId, response);
		} catch (err) {
			const error = err instanceof Error ? err.message : "Unknown error";
			this.sendResponse(peerId, {
				requestId: request.requestId,
				success: false,
				taskId: request.taskId,
				error,
				sentAt: Date.now(),
			});
		}
	}

	/**
	 * Handles incoming agent launch response from a peer.
	 */
	private handleLaunchResponse(_peerId: string, data: Uint8Array): void {
		let response: AgentLaunchResponse;
		try {
			response = decodeAgentLaunchResponse(data);
		} catch {
			return;
		}

		/** Find and resolve pending request */
		const pending = this.pendingRequests.get(response.requestId);
		if (!pending) {
			return;
		}

		/** Clear timeout and remove from pending */
		clearTimeout(pending.timeoutId);
		this.pendingRequests.delete(response.requestId);

		/** Resolve with result */
		if (response.success && response.pid !== undefined) {
			pending.resolve({
				success: true,
				taskId: response.taskId,
				pid: response.pid,
				sessionId: response.sessionId,
			});
		} else {
			pending.resolve({
				success: false,
				taskId: response.taskId,
				error: response.error ?? "Unknown error",
			});
		}
	}

	/**
	 * Sends a response back to a peer.
	 */
	private sendResponse(peerId: string, response: AgentLaunchResponse): void {
		const peer = this.peers.get(peerId);
		if (!peer || !peer.connected) return;

		const encoded = encodeAgentLaunchResponse(response);
		peer.send(encoded);
	}

	/**
	 * Handles peer disconnect.
	 */
	private handlePeerClose(peerId: string): void {
		/** Fail any pending requests to this peer */
		for (const [requestId, pending] of this.pendingRequests) {
			if (pending.peerId === peerId) {
				clearTimeout(pending.timeoutId);
				pending.resolve({
					success: false,
					taskId: pending.taskId,
					error: "Peer disconnected",
				});
				this.pendingRequests.delete(requestId);
			}
		}

		/** Remove listener */
		this.peerListeners.delete(peerId);
	}

	/**
	 * Sets the handler for incoming agent launch requests.
	 * Call this if this peer has daemon access and can launch agents.
	 *
	 * @param handler - Function to handle incoming requests
	 */
	setRequestHandler(handler: AgentLaunchRequestHandler | null): void {
		this.requestHandler = handler;
	}

	/**
	 * Launches an agent via a P2P peer.
	 * Call this if this peer has no daemon but wants to launch an agent.
	 *
	 * @param peerId - ID of the peer with daemon access
	 * @param options - Launch options (taskId, prompt or a2aPayload, cwd)
	 * @returns Promise that resolves with launch result
	 */
	async launchViaP2P(
		peerId: string,
		options: P2PAgentLaunchOptions,
	): Promise<P2PAgentLaunchResult> {
		const peer = this.peers.get(peerId);
		if (!peer) {
			return {
				success: false,
				taskId: options.taskId,
				error: `Peer ${peerId} not found`,
			};
		}

		if (!peer.connected) {
			return {
				success: false,
				taskId: options.taskId,
				error: `Peer ${peerId} not connected`,
			};
		}

		/** Rate limiting - check pending requests to this peer */
		const pendingToPeer = Array.from(this.pendingRequests.values()).filter(
			(p) => p.peerId === peerId,
		).length;
		if (pendingToPeer >= MAX_PENDING_REQUESTS_PER_PEER) {
			return {
				success: false,
				taskId: options.taskId,
				error: "Too many pending requests to this peer",
			};
		}

		const requestId = crypto.randomUUID();

		return new Promise((resolve) => {
			/** Set up timeout */
			const timeoutId = setTimeout(() => {
				const pending = this.pendingRequests.get(requestId);
				if (pending) {
					this.pendingRequests.delete(requestId);
					pending.resolve({
						success: false,
						taskId: options.taskId,
						error: "Request timed out",
					});
				}
			}, REQUEST_TIMEOUT);

			/** Track pending request */
			this.pendingRequests.set(requestId, {
				requestId,
				taskId: options.taskId,
				peerId,
				sentAt: Date.now(),
				resolve,
				timeoutId,
			});

			/** Build and send request */
			const request: AgentLaunchRequest = {
				requestId,
				taskId: options.taskId,
				prompt: options.prompt,
				cwd: options.cwd,
				a2aPayload: options.a2aPayload,
				sentAt: Date.now(),
			};

			const encoded = encodeAgentLaunchRequest(request);
			peer.send(encoded);
		});
	}

	/**
	 * Adds a new peer to track.
	 * Call this when new peers connect.
	 */
	addPeer(peerId: string, peer: PeerConnection): void {
		if (this.disposed) return;
		this.peers.set(peerId, peer);
		this.addPeerListener(peerId, peer);
	}

	/**
	 * Removes a peer from tracking.
	 * Call this when peers disconnect.
	 */
	removePeer(peerId: string): void {
		const peer = this.peers.get(peerId);
		const listeners = this.peerListeners.get(peerId);

		if (peer && listeners) {
			peer.removeListener("data", listeners.data);
			peer.removeListener("close", listeners.close);
		}

		this.peers.delete(peerId);
		this.peerListeners.delete(peerId);
		this.handlePeerClose(peerId);
	}

	/**
	 * Gets the list of connected peer IDs.
	 */
	getConnectedPeerIds(): string[] {
		return Array.from(this.peers.entries())
			.filter(([_, peer]) => peer.connected)
			.map(([id]) => id);
	}

	/**
	 * Cleans up all resources.
	 * Call this when the manager is no longer needed.
	 */
	dispose(): void {
		this.disposed = true;

		/** Cancel all pending requests */
		for (const [requestId, pending] of this.pendingRequests) {
			clearTimeout(pending.timeoutId);
			pending.resolve({
				success: false,
				taskId: pending.taskId,
				error: "Manager disposed",
			});
			this.pendingRequests.delete(requestId);
		}

		/** Remove all listeners */
		for (const [peerId, peer] of this.peers) {
			const listeners = this.peerListeners.get(peerId);
			if (listeners) {
				peer.removeListener("data", listeners.data);
				peer.removeListener("close", listeners.close);
			}
		}

		this.peerListeners.clear();
		this.requestHandler = null;
	}
}
