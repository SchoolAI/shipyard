import { useEffect, useRef } from "react";
import { toast } from "sonner";
import type { WebrtcProvider } from "y-webrtc";
import {
	isPlanAwarenessState,
	type PlanAwarenessState,
} from "@/types/awareness";

/**
 * Extracts the plan status from a raw awareness state entry.
 * Handles type validation and conversion from unknown state.
 */
function extractPlanStatus(state: unknown): PlanAwarenessState | undefined {
	if (!state || typeof state !== "object") return undefined;
	const stateRecord = Object.fromEntries(Object.entries(state));
	const planStatusRaw = stateRecord.planStatus;
	return isPlanAwarenessState(planStatusRaw) ? planStatusRaw : undefined;
}

/**
 * Extracts a pending user from a plan status, if valid.
 * Returns null if the status is not a valid pending user.
 */
function extractPendingUser(planStatus: PlanAwarenessState | undefined): {
	userId: string;
	userName: string;
} | null {
	if (!planStatus || planStatus.status !== "pending") {
		return null;
	}
	if (planStatus.isOwner) {
		return null;
	}
	return { userId: planStatus.user.id, userName: planStatus.user.name };
}

/**
 * Shows a toast notification for a new pending user.
 */
function showPendingUserToast(
	userName: string,
	onOpenApprovalPanel?: () => void,
): void {
	toast.info(`${userName} requests access`, {
		description: "Tap to review access requests",
		duration: 10000,
		action: onOpenApprovalPanel
			? {
					label: "View",
					onClick: onOpenApprovalPanel,
				}
			: undefined,
	});
}

/**
 * Hook that shows toast notifications when new users request access.
 * Only active when the current user is the plan owner.
 *
 * @param rtcProvider - WebRTC provider with awareness state
 * @param isOwner - Whether the current user is the plan owner
 * @param onOpenApprovalPanel - Optional callback to open the approval panel
 */
export function usePendingUserNotifications(
	rtcProvider: WebrtcProvider | null,
	isOwner: boolean,
	onOpenApprovalPanel?: () => void,
): void {
	const seenPendingUsersRef = useRef<Set<string>>(new Set());

	useEffect(() => {
		if (!rtcProvider || !isOwner) {
			seenPendingUsersRef.current.clear();
			return;
		}

		const awareness = rtcProvider.awareness;

		const checkForNewPendingUsers = () => {
			const states = awareness.getStates();
			const currentPendingUsers = new Set<string>();

			for (const [, state] of states) {
				const planStatus = extractPlanStatus(state);
				const pendingUser = extractPendingUser(planStatus);
				if (!pendingUser) continue;

				const { userId, userName } = pendingUser;
				currentPendingUsers.add(userId);

				if (!seenPendingUsersRef.current.has(userId)) {
					showPendingUserToast(userName, onOpenApprovalPanel);
				}
			}

			seenPendingUsersRef.current = currentPendingUsers;
		};

		checkForNewPendingUsers();
		awareness.on("change", checkForNewPendingUsers);

		return () => {
			awareness.off("change", checkForNewPendingUsers);
		};
	}, [rtcProvider, isOwner, onOpenApprovalPanel]);
}
