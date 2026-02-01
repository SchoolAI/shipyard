/**
 * WebRTC signaling relay helpers.
 */

/**
 * Find WebSocket by machine ID (for PersonalRoom).
 */
export function findWebSocketByMachineId<T extends { machineId?: string }>(
	connections: Map<WebSocket, T>,
	targetMachineId: string,
): WebSocket | null {
	for (const [ws, state] of connections) {
		if (state.machineId === targetMachineId) {
			return ws;
		}
	}
	return null;
}

/**
 * Find WebSocket by user ID (for CollabRoom).
 */
export function findWebSocketByUserId<T extends { userId?: string }>(
	connections: Map<WebSocket, T>,
	targetUserId: string,
): WebSocket | null {
	for (const [ws, state] of connections) {
		if (state.userId === targetUserId) {
			return ws;
		}
	}
	return null;
}

/**
 * Relay a WebRTC signaling message to target.
 * Returns true if message was sent, false if target not found.
 */
export function relayMessage(
	targetWs: WebSocket | null,
	message: unknown,
): boolean {
	if (!targetWs) {
		return false;
	}

	try {
		targetWs.send(JSON.stringify(message));
		return true;
	} catch {
		return false;
	}
}

/**
 * Broadcast a message to all connections except sender.
 */
export function broadcastExcept(
	connections: Map<WebSocket, unknown>,
	message: unknown,
	exclude?: WebSocket,
): number {
	const messageStr = JSON.stringify(message);
	let sent = 0;

	for (const ws of connections.keys()) {
		if (ws !== exclude) {
			try {
				ws.send(messageStr);
				sent++;
			} catch {}
		}
	}

	return sent;
}
