import type { BrowserContext } from "@shipyard/schema";
import { useCallback, useEffect, useRef } from "react";
import type { WebrtcProvider } from "y-webrtc";
import type { GitHubIdentity } from "@/hooks/useGitHubAuth";
import type { ApprovalStatus } from "@/hooks/useYDocApprovalStatus";
import type { PlanAwarenessState } from "@/types/awareness";
import { getWebrtcPeerId } from "@/types/y-webrtc-internals";

/**
 * Generate a deterministic color from a string (e.g., username).
 * Uses a simple hash to pick a hue for consistent colors per user.
 */
function colorFromString(str: string): string {
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		hash = str.charCodeAt(i) + ((hash << 5) - hash);
	}
	const hue = Math.abs(hash) % 360;
	return `hsl(${hue}, 70%, 50%)`;
}

/**
 * Detect browser name from user agent string.
 * Handles common browsers and edge cases.
 */
function detectBrowser(): string {
	const ua = navigator.userAgent;

	if (ua.includes("Edg/")) return "Edge";
	if (ua.includes("OPR/") || ua.includes("Opera")) return "Opera";
	if (ua.includes("Brave")) return "Brave";
	if (ua.includes("Vivaldi")) return "Vivaldi";
	if (ua.includes("Chrome")) return "Chrome";
	if (ua.includes("Safari") && !ua.includes("Chrome")) return "Safari";
	if (ua.includes("Firefox")) return "Firefox";

	return "Browser";
}

/**
 * Detect operating system from user agent string.
 */
function detectOS(): string {
	const ua = navigator.userAgent;

	if (ua.includes("Mac OS X") || ua.includes("Macintosh")) return "macOS";
	if (ua.includes("Windows")) return "Windows";
	if (ua.includes("Linux") && !ua.includes("Android")) return "Linux";
	if (ua.includes("Android")) return "Android";
	if (ua.includes("iPhone") || ua.includes("iPad")) return "iOS";
	if (ua.includes("CrOS")) return "ChromeOS";

	return "Unknown";
}

/**
 * Get browser context with detected browser and OS.
 * Only computed once and cached.
 */
function getBrowserContext(lastActive: number): BrowserContext {
	return {
		browser: detectBrowser(),
		os: detectOS(),
		lastActive,
	};
}

interface UseBroadcastApprovalStatusOptions {
	rtcProvider: WebrtcProvider | null;
	githubIdentity: GitHubIdentity | null;
	approvalStatus: ApprovalStatus | undefined;
	isOwner: boolean;
	planId: string;
	/**
	 * Whether this browser has a connected daemon.
	 * Used for P2P agent launching - other peers can launch agents via this peer.
	 *
	 * @see Issue #218 - A2A for Daemon (P2P Agent Launching)
	 */
	hasDaemon?: boolean;
}

/** Interval for updating lastActive timestamp (30 seconds) */
const ACTIVITY_UPDATE_INTERVAL = 30_000;

/**
 * Broadcasts the user's approval status to WebRTC awareness.
 *
 * This allows plan owners to see pending users requesting access.
 * The approval status is read from Y.Doc CRDT and broadcast via awareness
 * so other peers (especially the owner) can see who is waiting.
 *
 * Key insight: This was removed in commit a4a6f9d when Milestone 8 was simplified.
 * The usePendingUsers hook depends on awareness.planStatus to detect pending users,
 * but nothing was setting it after the simplification. This hook restores that.
 */
export function useBroadcastApprovalStatus({
	rtcProvider,
	githubIdentity,
	approvalStatus,
	isOwner,
	planId,
	hasDaemon,
}: UseBroadcastApprovalStatusOptions): void {
	/** Store requestedAt timestamp to prevent it from refreshing on re-render */
	const requestedAtRef = useRef<number | null>(null);
	/** Store last activity timestamp */
	const lastActiveRef = useRef<number>(Date.now());
	/** Store current planStatus to update only browserContext.lastActive */
	const currentPlanStatusRef = useRef<PlanAwarenessState | null>(null);
	/** Store last broadcast lastActive to only update on changes */
	const lastBroadcastActiveRef = useRef<number | null>(null);

	/** Update lastActive on user interaction */
	const updateLastActive = useCallback(() => {
		lastActiveRef.current = Date.now();
	}, []);

	/** Set up activity listeners */
	useEffect(() => {
		const events = ["mousedown", "keydown", "scroll", "touchstart", "focus"];
		for (const event of events) {
			window.addEventListener(event, updateLastActive, { passive: true });
		}
		return () => {
			for (const event of events) {
				window.removeEventListener(event, updateLastActive);
			}
		};
	}, [updateLastActive]);

	useEffect(() => {
		if (!rtcProvider || !githubIdentity) {
			return;
		}

		/** Validate planId is non-empty */
		if (!planId || planId.trim() === "") {
			return;
		}

		const awareness = rtcProvider.awareness;

		/** Get WebRTC peerId from the room */
		const webrtcPeerId = getWebrtcPeerId(rtcProvider);

		/** Get browser context with current lastActive */
		const browserContext = getBrowserContext(lastActiveRef.current);

		/*
		 * Build the awareness state based on approval status.
		 * IMPORTANT: Must include platform: 'browser' so useP2PPeers can distinguish
		 * browsers from agents. This field was previously omitted which caused all
		 * peers to show as "browsers" even when agents were connected.
		 */
		const baseState = {
			user: {
				id: githubIdentity.username,
				name: githubIdentity.displayName,
				color: colorFromString(githubIdentity.username),
			},
			platform: "browser" as const,
			isOwner,
			webrtcPeerId,
			browserContext,
			hasDaemon,
		};

		let planStatus: PlanAwarenessState;

		if (approvalStatus === "pending") {
			/** Set requestedAt only once when entering pending state */
			if (requestedAtRef.current === null) {
				requestedAtRef.current = Date.now();
			}

			planStatus = {
				...baseState,
				status: "pending",
				requestedAt: requestedAtRef.current,
				planId,
				expiresAt: requestedAtRef.current + 24 * 60 * 60 * 1000,
			};
		} else if (approvalStatus === "approved" || approvalStatus === "rejected") {
			/** Clear requestedAt when leaving pending state */
			requestedAtRef.current = null;

			planStatus = {
				...baseState,
				status: approvalStatus,
				planId,
			};
		} else {
			/** Clear requestedAt for other states */
			requestedAtRef.current = null;
			/** No approval required - don't broadcast planStatus */
			return;
		}

		/** Store for activity updates */
		currentPlanStatusRef.current = planStatus;

		/** Broadcast to awareness */
		awareness.setLocalStateField("planStatus", planStatus);

		/** Set up interval to periodically update lastActive (only if changed) */
		const activityInterval = setInterval(() => {
			if (!currentPlanStatusRef.current) return;

			/** Only broadcast if lastActive has changed since last broadcast */
			if (lastBroadcastActiveRef.current === lastActiveRef.current) return;

			const updatedStatus: PlanAwarenessState = {
				...currentPlanStatusRef.current,
				browserContext: {
					...currentPlanStatusRef.current.browserContext,
					lastActive: lastActiveRef.current,
				},
			};
			currentPlanStatusRef.current = updatedStatus;
			lastBroadcastActiveRef.current = lastActiveRef.current;
			awareness.setLocalStateField("planStatus", updatedStatus);
		}, ACTIVITY_UPDATE_INTERVAL);

		/** Cleanup: Clear planStatus when component unmounts */
		return () => {
			clearInterval(activityInterval);
			currentPlanStatusRef.current = null;
			/*
			 * Note: If browser closes ungracefully (force quit), awareness state
			 * persists until WebRTC timeout (~30 seconds). This is expected behavior.
			 * The beforeunload handler in useMultiProviderSync sets localState to null,
			 * which also clears planStatus. The 24-hour expiration provides secondary cleanup.
			 */
			if (awareness.getLocalState()?.planStatus) {
				awareness.setLocalStateField("planStatus", null);
			}
		};
	}, [rtcProvider, githubIdentity, approvalStatus, isOwner, planId, hasDaemon]);
}
