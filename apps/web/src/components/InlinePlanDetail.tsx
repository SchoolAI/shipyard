/**
 * Inline detail panel for viewing plans in list views.
 * Used by InboxPage, ArchivePage, and SearchPage for consistent plan viewing.
 */

import type { BlockNoteEditor } from "@blocknote/core";
import { Spinner } from "@heroui/react";
import {
	getDeliverables,
	getPlanMetadata,
	type PlanMetadata,
	type PlanViewTab,
	YDOC_KEYS,
} from "@shipyard/schema";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type * as Y from "yjs";
import { AuthChoiceModal } from "@/components/AuthChoiceModal";
import { GitHubAuthOverlay } from "@/components/GitHubAuthModal";
import { PlanContent } from "@/components/PlanContent";
import type { PanelWidth } from "@/components/PlanPanel";
import { PlanPanelHeader } from "@/components/PlanPanelHeader";
import { SignInModal } from "@/components/SignInModal";
import { getPlanRoute } from "@/constants/routes";
import { useGitHubAuth } from "@/hooks/useGitHubAuth";
import { useLocalIdentity } from "@/hooks/useLocalIdentity";
import { useMultiProviderSync } from "@/hooks/useMultiProviderSync";
import { usePlanIndex } from "@/hooks/usePlanIndex";
import { colorFromString } from "@/utils/color";
import { formatRelativeTime } from "@/utils/formatters";
import { setSidebarCollapsed } from "@/utils/uiPreferences";

export interface PlanActionContext {
	planId: string;
	ydoc: Y.Doc;
	metadata: PlanMetadata;
}

export interface InlinePlanDetailProps {
	/** Plan ID to display, null if no plan selected */
	planId: string | null;
	/** Initial tab to show when plan loads (defaults to 'plan') */
	initialTab?: PlanViewTab;
	/** Called when panel should close */
	onClose: () => void;
	/** Called when approve action is triggered. Receives plan context. If not provided, navigates to plan page. */
	onApprove?: (context: PlanActionContext) => void;
	/** Called when request changes action is triggered. Receives plan context. If not provided, navigates to plan page. */
	onRequestChanges?: (context: PlanActionContext) => void;
	/** Called when expand button is pressed. If not provided, expand button is hidden. */
	onExpand?: () => void;
	/** Panel width for header display. Defaults to 'peek' for inline panels. */
	width?: PanelWidth;
	/** Message shown when no plan is selected */
	emptyMessage?: string;
	/** Called after status change (for updating plan index) */
	onStatusChange?: (
		newStatus: "in_progress" | "changes_requested",
		updatedAt: number,
	) => void;
}

/**
 * Inline plan detail panel with sync, metadata loading, and content display.
 * Handles all shared logic for viewing plans in a detail panel.
 */
export function InlinePlanDetail({
	planId,
	initialTab: _initialTab,
	onClose,
	onApprove,
	onRequestChanges,
	onExpand,
	width = "peek",
	emptyMessage = "Select a task to view details",
	onStatusChange,
}: InlinePlanDetailProps) {
	const navigate = useNavigate();
	const { identity: githubIdentity, startAuth, authState } = useGitHubAuth();
	const { localIdentity, setLocalIdentity } = useLocalIdentity();
	const [showAuthChoice, setShowAuthChoice] = useState(false);
	const [showLocalSignIn, setShowLocalSignIn] = useState(false);

	const [panelMetadata, setPanelMetadata] = useState<PlanMetadata | null>(null);
	const [panelDeliverableStats, setPanelDeliverableStats] = useState({
		completed: 0,
		total: 0,
	});
	const [panelLastActivity, setPanelLastActivity] = useState("");
	const [loadTimeout, setLoadTimeout] = useState(false);
	const [editor, setEditor] = useState<BlockNoteEditor | null>(null);

	const {
		ydoc: panelYdoc,
		syncState: panelSyncState,
		wsProvider: panelWsProvider,
		rtcProvider: panelRtcProvider,
	} = useMultiProviderSync(planId || "");

	useEffect(() => {
		if (!planId) {
			setLoadTimeout(false);
			return;
		}

		const timer = setTimeout(() => {
			if (!panelMetadata) {
				setLoadTimeout(true);
			}
		}, 10000);

		return () => clearTimeout(timer);
	}, [planId, panelMetadata]);

	/** Load panel metadata when plan is selected */
	useEffect(() => {
		if (!planId || !panelSyncState.idbSynced) {
			setPanelMetadata(null);
			setLoadTimeout(false);
			return;
		}

		const metaMap = panelYdoc.getMap<PlanMetadata>(YDOC_KEYS.METADATA);
		const update = () => {
			const metadata = getPlanMetadata(panelYdoc);
			setPanelMetadata(metadata);

			const deliverables = getDeliverables(panelYdoc);
			const completed = deliverables.filter((d) => d.linkedArtifactId).length;
			setPanelDeliverableStats({ completed, total: deliverables.length });

			if (metadata?.updatedAt) {
				setPanelLastActivity(
					`Updated ${formatRelativeTime(metadata.updatedAt)}`,
				);
			}
		};
		update();
		metaMap.observe(update);
		return () => metaMap.unobserve(update);
	}, [planId, panelYdoc, panelSyncState.idbSynced]);

	/** Mark plan as read once panel metadata loads (decouples from click handler) */
	const currentUsername = githubIdentity?.username || localIdentity?.username;
	const { markPlanAsRead, allInboxPlans } = usePlanIndex(currentUsername);
	useEffect(() => {
		if (!planId || !panelMetadata) return;

		const plan = allInboxPlans.find((p) => p.id === planId);
		if (plan?.isUnread) {
			markPlanAsRead(planId);
		}
	}, [planId, panelMetadata, allInboxPlans, markPlanAsRead]);

	const identity = githubIdentity
		? {
				id: githubIdentity.username,
				name: githubIdentity.displayName,
				color: colorFromString(githubIdentity.username),
			}
		: localIdentity
			? {
					id: `local:${localIdentity.username}`,
					name: localIdentity.username,
					color: colorFromString(localIdentity.username),
				}
			: null;

	const handleRequestIdentity = useCallback(() => {
		setShowAuthChoice(true);
	}, []);

	const handleEditorReady = useCallback((newEditor: BlockNoteEditor) => {
		setEditor(newEditor);
	}, []);

	const handleLocalSignIn = useCallback(
		(username: string) => {
			setLocalIdentity(username);
			setShowLocalSignIn(false);
		},
		[setLocalIdentity],
	);

	const handleFullScreen = useCallback(() => {
		if (planId) {
			setSidebarCollapsed(true);
			navigate(getPlanRoute(planId));
		}
	}, [planId, navigate]);

	const handleApprove = useCallback(() => {
		if (onApprove && planId && panelMetadata) {
			onApprove({ planId, ydoc: panelYdoc, metadata: panelMetadata });
		} else if (planId) {
			navigate(getPlanRoute(planId));
		}
	}, [onApprove, planId, panelYdoc, panelMetadata, navigate]);

	const handleRequestChanges = useCallback(() => {
		if (onRequestChanges && planId && panelMetadata) {
			onRequestChanges({ planId, ydoc: panelYdoc, metadata: panelMetadata });
		} else if (planId) {
			navigate(getPlanRoute(planId));
		}
	}, [onRequestChanges, planId, panelYdoc, panelMetadata, navigate]);

	const activeProvider = panelWsProvider ?? panelRtcProvider;

	const authModals = (
		<>
			<GitHubAuthOverlay authState={authState} />
			<AuthChoiceModal
				isOpen={showAuthChoice}
				onOpenChange={setShowAuthChoice}
				onGitHubAuth={startAuth}
				onLocalAuth={() => setShowLocalSignIn(true)}
			/>
			<SignInModal
				isOpen={showLocalSignIn}
				onClose={() => setShowLocalSignIn(false)}
				onSignIn={handleLocalSignIn}
			/>
		</>
	);

	if (planId && panelMetadata) {
		return (
			<>
				<div className="flex flex-col h-full">
					<PlanPanelHeader
						metadata={panelMetadata}
						deliverableStats={panelDeliverableStats}
						lastActivityText={panelLastActivity}
						onApprove={handleApprove}
						onRequestChanges={handleRequestChanges}
						onClose={onClose}
						onExpand={onExpand}
						onFullScreen={handleFullScreen}
						width={width}
						ydoc={panelYdoc}
						identity={identity}
						onRequestIdentity={handleRequestIdentity}
						editor={editor}
						onStatusChange={onStatusChange}
					/>
					<div className="flex-1 overflow-y-auto">
						<PlanContent
							mode="live"
							ydoc={panelYdoc}
							metadata={panelMetadata}
							syncState={panelSyncState}
							identity={identity}
							onRequestIdentity={handleRequestIdentity}
							provider={activeProvider}
							onEditorReady={handleEditorReady}
						/>
					</div>
				</div>
				{authModals}
			</>
		);
	}

	if (planId) {
		if (loadTimeout) {
			return (
				<>
					<div className="flex items-center justify-center h-full">
						<div className="text-center">
							<p className="text-danger mb-2">Task not found</p>
							<p className="text-sm text-muted-foreground">
								This task may have been deleted or is invalid.
							</p>
						</div>
					</div>
					{authModals}
				</>
			);
		}

		return (
			<>
				<div className="flex items-center justify-center h-full">
					<div className="flex flex-col items-center gap-4">
						<Spinner size="lg" />
						<p className="text-muted-foreground">Loading task...</p>
					</div>
				</div>
				{authModals}
			</>
		);
	}

	return (
		<>
			<div className="flex items-center justify-center h-full text-muted-foreground">
				<p>{emptyMessage}</p>
			</div>
			{authModals}
		</>
	);
}
