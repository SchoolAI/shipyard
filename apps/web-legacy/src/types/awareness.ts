import type {
	BrowserContext,
	EnvironmentContext,
	OriginPlatform,
} from "@shipyard/schema";

/**
 * Approval status for a user in the awareness protocol.
 */
export type ApprovalStatus = "pending" | "approved" | "rejected";

/**
 * Common fields shared between pending and approved/rejected states.
 */
interface BasePlanAwarenessFields {
	user: {
		id: string;
		name: string;
		color: string;
	};
	isOwner: boolean;
	/**
	 * Which plan this state applies to.
	 * Used to scope approval status to specific plans.
	 */
	planId: string;
	/**
	 * Platform type for this peer (browser, MCP server, etc.)
	 * Used to distinguish between different types of participants.
	 */
	platform?: OriginPlatform;
	/**
	 * WebRTC peerId (UUID) for P2P transfers.
	 * This is different from the awareness clientID (number).
	 * The webrtcPeerId is used as the key in room.webrtcConns.
	 */
	webrtcPeerId?: string;
	/**
	 * Environment context for agent identification.
	 * Helps users distinguish agents working from different machines/branches.
	 */
	context?: EnvironmentContext;
	/**
	 * Browser context for browser peer identification.
	 * Includes browser type, OS, and last active timestamp.
	 */
	browserContext?: BrowserContext;
	/**
	 * Whether this peer has a connected daemon for agent launching.
	 * Used for P2P agent launching - mobile browsers can launch agents
	 * via peers that have daemon connections.
	 *
	 * @see Issue #218 - A2A for Daemon (P2P Agent Launching)
	 */
	hasDaemon?: boolean;
}

/**
 * Awareness state for a user in a plan.
 * Used for WebRTC awareness protocol to communicate user presence and approval status.
 *
 * This is separate from the Y.Doc metadata (which is the source of truth for approval).
 * Awareness is used for real-time presence and to show pending access requests.
 */
export type PlanAwarenessState =
	| (BasePlanAwarenessFields & {
			status: "pending";
			requestedAt: number;
			/**
			 * When the request expires (Unix timestamp in milliseconds).
			 * Default: 24 hours from requestedAt.
			 */
			expiresAt: number;
	  })
	| (BasePlanAwarenessFields & {
			status: "approved" | "rejected";
	  });

/** Helper to check if user object has required string fields */
function isValidUser(user: unknown): boolean {
	if (!user || typeof user !== "object") return false;
	const u = Object.fromEntries(Object.entries(user));
	return (
		typeof u.id === "string" &&
		typeof u.name === "string" &&
		typeof u.color === "string"
	);
}

/** Helper to validate common base fields */
function hasValidBaseFields(obj: Record<string, unknown>): boolean {
	return (
		typeof obj.status === "string" &&
		typeof obj.isOwner === "boolean" &&
		typeof obj.planId === "string" &&
		isValidUser(obj.user)
	);
}

/** Helper to validate pending status fields */
function isValidPendingStatus(obj: Record<string, unknown>): boolean {
	return (
		typeof obj.requestedAt === "number" && typeof obj.expiresAt === "number"
	);
}

/**
 * Type guard to validate a PlanAwarenessState object.
 * Used for safely parsing awareness state from WebRTC.
 */
export function isPlanAwarenessState(
	value: unknown,
): value is PlanAwarenessState {
	if (!value || typeof value !== "object") return false;
	const obj = Object.fromEntries(Object.entries(value));

	if (!hasValidBaseFields(obj)) return false;

	const status = obj.status;
	if (status === "pending") return isValidPendingStatus(obj);
	return status === "approved" || status === "rejected";
}
