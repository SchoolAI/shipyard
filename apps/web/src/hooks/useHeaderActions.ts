/**
 * Hook to manage PlanHeader actions including archive, share, and mobile import.
 * Consolidates state management for header action buttons.
 */

import type { A2AMessage, ConversationExportMeta } from "@shipyard/schema";
import {
	archivePlan,
	getPlanIndexEntry,
	getPlanOwnerId,
	logPlanEvent,
	setPlanIndexEntry,
	unarchivePlan,
} from "@shipyard/schema";
import { useRef, useState } from "react";
import { toast } from "sonner";
import type { WebrtcProvider } from "y-webrtc";
import type * as Y from "yjs";
import { useUserIdentity } from "@/contexts/UserIdentityContext";
import { useConversationTransfer } from "@/hooks/useConversationTransfer";
import { useGitHubAuth } from "@/hooks/useGitHubAuth";

/** Data structure for mobile import review */
export interface MobileImportData {
	messages: A2AMessage[];
	meta: ConversationExportMeta;
	summary: { title: string; text: string };
}

/** Return type for the useHeaderActions hook */
export interface UseHeaderActionsReturn {
	/** Dialog states */
	isHandoffDialogOpen: boolean;
	setIsHandoffDialogOpen: (open: boolean) => void;
	isLinkPROpen: boolean;
	setIsLinkPROpen: (open: boolean) => void;
	isTagEditorOpen: boolean;
	setIsTagEditorOpen: (open: boolean) => void;

	/** Mobile import state */
	mobileImportInputRef: React.RefObject<HTMLInputElement | null>;
	mobileImportData: MobileImportData | null;
	isMobileReviewOpen: boolean;
	setIsMobileReviewOpen: (open: boolean) => void;

	/** Actions */
	handleArchiveToggle: () => void;
	handleShare: () => Promise<void>;
	handleMobileFileSelect: (
		event: React.ChangeEvent<HTMLInputElement>,
	) => Promise<void>;
	handleMobileImportConfirm: () => void;
	handleMobileImportCancel: () => void;
	handleDropdownAction: (key: React.Key) => void;
}

/** Options for configuring the header actions hook */
export interface UseHeaderActionsOptions {
	/** Callback for copying snapshot URL (handled by parent with access to editor) */
	onCopySnapshotUrl?: () => void;
}

/**
 * Hook for managing PlanHeader actions and dialog states.
 *
 * @param ydoc - Plan Y.Doc
 * @param indexDoc - Plan index Y.Doc
 * @param planId - Current plan ID
 * @param isArchived - Whether the plan is archived
 * @param rtcProvider - WebRTC provider for conversation transfer
 * @param options - Optional configuration
 */
export function useHeaderActions(
	ydoc: Y.Doc,
	indexDoc: Y.Doc | null,
	planId: string,
	isArchived: boolean,
	rtcProvider: WebrtcProvider | null,
	options: UseHeaderActionsOptions = {},
): UseHeaderActionsReturn {
	const { identity: githubIdentity } = useGitHubAuth();
	const { actor } = useUserIdentity();
	const ownerId = getPlanOwnerId(ydoc);

	/** Dialog states */
	const [isHandoffDialogOpen, setIsHandoffDialogOpen] = useState(false);
	const [isLinkPROpen, setIsLinkPROpen] = useState(false);
	const [isTagEditorOpen, setIsTagEditorOpen] = useState(false);

	/** Mobile import state */
	const mobileImportInputRef = useRef<HTMLInputElement>(null);
	const [mobileImportData, setMobileImportData] =
		useState<MobileImportData | null>(null);
	const [isMobileReviewOpen, setIsMobileReviewOpen] = useState(false);

	/** Conversation transfer hook for mobile import */
	const { importFromFile } = useConversationTransfer(planId, ydoc, rtcProvider);

	const handleArchiveToggle = () => {
		if (isArchived) {
			unarchivePlan(ydoc, actor);
		} else {
			archivePlan(ydoc, actor);
		}

		logPlanEvent(ydoc, isArchived ? "plan_unarchived" : "plan_archived", actor);

		if (indexDoc) {
			const entry = getPlanIndexEntry(indexDoc, planId);
			if (entry) {
				if (isArchived) {
					setPlanIndexEntry(indexDoc, {
						id: entry.id,
						title: entry.title,
						status: entry.status,
						epoch: entry.epoch,
						createdAt: entry.createdAt,
						updatedAt: Date.now(),
						ownerId: entry.ownerId,
						deleted: false,
					});
					toast.success("Task unarchived");
				} else {
					setPlanIndexEntry(indexDoc, {
						id: entry.id,
						title: entry.title,
						status: entry.status,
						epoch: entry.epoch,
						createdAt: entry.createdAt,
						updatedAt: Date.now(),
						ownerId: entry.ownerId,
						deleted: true,
						deletedAt: Date.now(),
						deletedBy: actor,
					});
					toast.success("Task archived");
				}
			}
		}
	};

	const handleShare = async () => {
		if (!githubIdentity) {
			toast.error("Sign in required", {
				description: "You need to sign in with GitHub to share this plan.",
			});
			return;
		}

		const isOwnerCheck =
			githubIdentity && ownerId && githubIdentity.username === ownerId;

		try {
			await navigator.clipboard.writeText(window.location.href);

			if (isOwnerCheck) {
				toast.success("Link copied to clipboard");
			} else {
				toast.info("Link copied (view-only access)", {
					description:
						"Sign in as the plan owner to create invite links with full access.",
				});
			}

			logPlanEvent(ydoc, "plan_shared", actor);
		} catch {
			/** Fallback for older browsers */
			const textArea = document.createElement("textarea");
			textArea.value = window.location.href;
			document.body.appendChild(textArea);
			textArea.select();
			document.execCommand("copy");
			document.body.removeChild(textArea);

			if (isOwnerCheck) {
				toast.success("Link copied to clipboard");
			} else {
				toast.info("Link copied (view-only access)", {
					description:
						"Sign in as the plan owner to create invite links with full access.",
				});
			}

			logPlanEvent(ydoc, "plan_shared", actor);
		}
	};

	const handleMobileFileSelect = async (
		event: React.ChangeEvent<HTMLInputElement>,
	) => {
		const file = event.target.files?.[0];
		if (!file) return;

		/** Reset input so same file can be selected again */
		event.target.value = "";

		const result = await importFromFile(file);

		if (result.success) {
			setMobileImportData({
				messages: result.messages,
				meta: result.meta,
				summary: result.summary,
			});
			setIsMobileReviewOpen(true);
		} else {
			toast.error(result.error);
		}
	};

	const handleMobileImportConfirm = () => {
		if (mobileImportData) {
			toast.success(`Imported ${mobileImportData.meta.messageCount} messages`);
		}
		setIsMobileReviewOpen(false);
		setMobileImportData(null);
	};

	const handleMobileImportCancel = () => {
		setIsMobileReviewOpen(false);
		setMobileImportData(null);
	};

	const handleDropdownAction = (key: React.Key) => {
		switch (key) {
			case "share":
				handleShare();
				break;
			case "copy-snapshot-url":
				options.onCopySnapshotUrl?.();
				break;
			case "import":
				mobileImportInputRef.current?.click();
				break;
			case "handoff":
				setIsHandoffDialogOpen(true);
				break;
			case "link-pr":
				setIsLinkPROpen(true);
				break;
			case "archive":
			case "unarchive":
				handleArchiveToggle();
				break;
		}
	};

	return {
		/** Dialog states */
		isHandoffDialogOpen,
		setIsHandoffDialogOpen,
		isLinkPROpen,
		setIsLinkPROpen,
		isTagEditorOpen,
		setIsTagEditorOpen,

		/** Mobile import state */
		mobileImportInputRef,
		mobileImportData,
		isMobileReviewOpen,
		setIsMobileReviewOpen,

		/** Actions */
		handleArchiveToggle,
		handleShare,
		handleMobileFileSelect,
		handleMobileImportConfirm,
		handleMobileImportCancel,
		handleDropdownAction,
	};
}
