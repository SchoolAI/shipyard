/**
 * Reusable plan content component with tabbed navigation.
 * Extracted from PlanPage to support both full-page and panel views.
 */

import type { Block, BlockNoteEditor } from "@blocknote/core";
import type { Deliverable, PlanMetadata, PlanSnapshot } from "@shipyard/schema";
import {
	extractDeliverables,
	getDeliverables,
	type PlanViewTab,
	YDOC_KEYS,
} from "@shipyard/schema";
import { Clock, FileText, GitPullRequest, Package } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { WebrtcProvider } from "y-webrtc";
import type { WebsocketProvider } from "y-websocket";
import type * as Y from "yjs";
import { ActivityTimeline } from "@/components/ActivityTimeline";
import { Attachments } from "@/components/Attachments";
import { ChangesHeaderControls } from "@/components/ChangesHeaderControls";
import { ChangesView, type ChangesViewState } from "@/components/ChangesView";
import { PlanViewerWithComments } from "@/components/comments";
import { DeliverablesView } from "@/components/DeliverablesView";
import { PlanViewer } from "@/components/PlanViewer";
import { VersionSelector } from "@/components/VersionSelector";
import type { SyncState } from "@/hooks/useMultiProviderSync";

/**
 * Type guard to check if an array is a Block[] from BlockNote.
 * Validates that each item has the required 'type' and 'id' properties.
 */
function isBlockArray(arr: unknown): arr is Block[] {
	return (
		Array.isArray(arr) &&
		arr.every(
			(item) =>
				typeof item === "object" &&
				item !== null &&
				"type" in item &&
				"id" in item,
		)
	);
}

/** Simple identity type for display purposes */
interface UserIdentity {
	id: string;
	name: string;
	color: string;
}

/** Provider type that BlockNote can use for collaboration */
type CollaborationProvider = WebsocketProvider | WebrtcProvider;

/** Version navigation state from useVersionNavigation hook */
interface VersionNavigationState {
	snapshots: PlanSnapshot[];
	currentIndex: number;
	currentSnapshot: PlanSnapshot | null;
	isViewingHistory: boolean;
	goToPrevious: () => void;
	goToNext: () => void;
	goToCurrent: () => void;
	canGoPrevious: boolean;
	canGoNext: boolean;
}

/** Props for live mode with collaboration */
interface LivePlanContentProps {
	mode: "live";
	/** The Yjs document containing plan data */
	ydoc: Y.Doc;
	/** Plan metadata */
	metadata: PlanMetadata;
	/** Current sync state */
	syncState: SyncState;
	/** User identity for comments */
	identity: UserIdentity | null;
	/** Called when user needs to authenticate for commenting */
	onRequestIdentity: () => void;
	/** Provider for collaboration (WebSocket or WebRTC) */
	provider: CollaborationProvider | null;
	/** Initial tab to show (defaults to 'plan') */
	initialTab?: PlanViewTab;
	/** Called when the active tab changes */
	onTabChange?: (tab: PlanViewTab) => void;
	/** Snapshot to view (when viewing version history) - Issue #42 */
	currentSnapshot?: { content: unknown[] } | null;
	/** Callback to receive editor instance for snapshots - Issue #42 */
	onEditorReady?: (editor: BlockNoteEditor) => void;
	/** Version navigation state - Issue #42 */
	versionNav?: VersionNavigationState;
}

/** Props for snapshot mode (read-only) */
interface SnapshotPlanContentProps {
	mode: "snapshot";
	/** The Yjs document containing plan data */
	ydoc: Y.Doc;
	/** Plan metadata */
	metadata: PlanMetadata;
	/** Current sync state */
	syncState: SyncState;
	/** Initial content for snapshots */
	initialContent: unknown[];
	/** Initial tab to show (defaults to 'plan') */
	initialTab?: PlanViewTab;
	/** Called when the active tab changes */
	onTabChange?: (tab: PlanViewTab) => void;
}

export type PlanContentProps = LivePlanContentProps | SnapshotPlanContentProps;

/**
 * Check if a value is a valid PlanViewTab.
 */
function isValidTab(value: string): value is PlanViewTab {
	return (
		value === "plan" ||
		value === "activity" ||
		value === "deliverables" ||
		value === "changes"
	);
}

/**
 * Extract tab from a custom event detail, with validation.
 */
function extractTabFromEvent(event: Event): PlanViewTab | null {
	if (
		!(event instanceof CustomEvent) ||
		!event.detail ||
		typeof event.detail !== "object"
	) {
		return null;
	}
	const detailRecord = Object.fromEntries(Object.entries(event.detail));
	const tab = detailRecord.tab;
	if (typeof tab === "string" && isValidTab(tab)) {
		return tab;
	}
	return null;
}

/**
 * Hook to track deliverable counts from Y.Doc.
 */
function useDeliverableCount(
	ydoc: Y.Doc,
	mode: "live" | "snapshot",
	initialContent?: unknown[],
): { completed: number; total: number } {
	const [count, setCount] = useState({ completed: 0, total: 0 });

	useEffect(() => {
		if (mode === "snapshot" && initialContent && isBlockArray(initialContent)) {
			const deliverables = extractDeliverables(initialContent);
			const deliverablesArray = ydoc.getArray<Deliverable>(
				YDOC_KEYS.DELIVERABLES,
			);
			deliverablesArray.delete(0, deliverablesArray.length);
			deliverablesArray.push(deliverables);

			const completed = deliverables.filter((d) => d.linkedArtifactId).length;
			setCount({ completed, total: deliverables.length });
			return;
		}

		const deliverablesArray = ydoc.getArray<Deliverable>(
			YDOC_KEYS.DELIVERABLES,
		);
		const updateCount = () => {
			const deliverables = getDeliverables(ydoc);
			const completed = deliverables.filter((d) => d.linkedArtifactId).length;
			setCount({ completed, total: deliverables.length });
		};
		updateCount();
		deliverablesArray.observe(updateCount);
		return () => deliverablesArray.unobserve(updateCount);
	}, [ydoc, mode, initialContent]);

	return count;
}

/** Props for a single tab button */
interface TabButtonProps {
	tab: PlanViewTab;
	activeView: PlanViewTab;
	onClick: (tab: PlanViewTab) => void;
	icon: React.ReactNode;
	label: string;
	badge?: React.ReactNode;
}

/** Reusable tab button component */
function TabButton({
	tab,
	activeView,
	onClick,
	icon,
	label,
	badge,
}: TabButtonProps) {
	const isActive = activeView === tab;
	return (
		<button
			type="button"
			onClick={() => onClick(tab)}
			className={`flex items-center justify-center gap-1.5 md:gap-2 pb-1.5 md:pb-2 px-1.5 md:px-2 font-medium text-xs md:text-sm transition-colors shrink-0 ${
				isActive
					? "text-primary border-b-2 border-primary"
					: "text-muted-foreground hover:text-foreground border-b-2 border-transparent"
			}`}
		>
			{icon}
			{label}
			{badge}
		</button>
	);
}

/** Props for PlanTabContent */
interface PlanTabContentProps {
	mode: "live" | "snapshot";
	ydoc: Y.Doc;
	identity?: UserIdentity | null;
	provider?: CollaborationProvider | null;
	onRequestIdentity?: () => void;
	currentSnapshot?: { content: unknown[] } | null;
	onEditorReady?: (editor: BlockNoteEditor) => void;
	initialContent?: unknown[];
}

/** Renders the Plan tab content */
function PlanTabContent({
	mode,
	ydoc,
	identity,
	provider,
	onRequestIdentity,
	currentSnapshot,
	onEditorReady,
	initialContent,
}: PlanTabContentProps) {
	if (mode === "live") {
		/**
		 * Use PlanViewerWithComments for live mode to show the comment gutter.
		 * The gutter only appears on desktop when the user has identity.
		 */
		return (
			<PlanViewerWithComments
				key={identity?.id ?? "anonymous"}
				ydoc={ydoc}
				identity={identity ?? null}
				provider={provider ?? null}
				onRequestIdentity={onRequestIdentity}
				currentSnapshot={currentSnapshot}
				onEditorReady={onEditorReady}
			/>
		);
	}

	if (initialContent && initialContent.length > 0) {
		return (
			<PlanViewer
				key="snapshot"
				ydoc={ydoc}
				identity={null}
				provider={null}
				initialContent={initialContent}
				currentSnapshot={{ content: initialContent }}
			/>
		);
	}

	return (
		<div className="p-8 text-center">
			<p className="text-muted-foreground">
				This snapshot contains metadata only. No plan content available.
			</p>
		</div>
	);
}

/** Props for TabNavigationBar */
interface TabNavigationBarProps {
	activeView: PlanViewTab;
	onTabChange: (tab: PlanViewTab) => void;
	mode: "live" | "snapshot";
	deliverableCount: { completed: number; total: number };
	versionNav?: VersionNavigationState;
	changesViewState: ChangesViewState | null;
	metadata: PlanMetadata;
	ydoc: Y.Doc;
}

/** Tab navigation bar with tabs and optional controls */
function TabNavigationBar({
	activeView,
	onTabChange,
	mode,
	deliverableCount,
	versionNav,
	changesViewState,
	metadata,
	ydoc,
}: TabNavigationBarProps) {
	const showVersionSelector =
		activeView === "plan" &&
		mode === "live" &&
		versionNav &&
		versionNav.snapshots.length > 0;

	const showChangesControls =
		activeView === "changes" && changesViewState !== null;

	return (
		<div className="border-b border-separator bg-surface px-2 md:px-6 shrink-0">
			<div className="flex items-center justify-between pt-1 md:pt-2">
				<div className="flex gap-0 md:gap-4 overflow-x-auto md:overflow-visible">
					<TabButton
						tab="plan"
						activeView={activeView}
						onClick={onTabChange}
						icon={<FileText className="w-3.5 h-3.5 md:w-4 md:h-4" />}
						label="Plan"
					/>
					<TabButton
						tab="deliverables"
						activeView={activeView}
						onClick={onTabChange}
						icon={<Package className="w-3.5 h-3.5 md:w-4 md:h-4" />}
						label="Deliverables"
						badge={
							deliverableCount.total > 0 ? (
								<span className="text-[10px] md:text-xs opacity-70">
									({deliverableCount.completed}/{deliverableCount.total})
								</span>
							) : undefined
						}
					/>
					{mode === "live" && (
						<>
							<TabButton
								tab="activity"
								activeView={activeView}
								onClick={onTabChange}
								icon={<Clock className="w-3.5 h-3.5 md:w-4 md:h-4" />}
								label="Activity"
							/>
							<TabButton
								tab="changes"
								activeView={activeView}
								onClick={onTabChange}
								icon={<GitPullRequest className="w-3.5 h-3.5 md:w-4 md:h-4" />}
								label="Changes"
							/>
						</>
					)}
				</div>

				{showVersionSelector && versionNav && (
					<div className="hidden md:block">
						<VersionSelector
							currentSnapshot={versionNav.currentSnapshot}
							totalSnapshots={versionNav.snapshots.length}
							currentIndex={versionNav.currentIndex}
							canGoPrevious={versionNav.canGoPrevious}
							canGoNext={versionNav.canGoNext}
							onPrevious={versionNav.goToPrevious}
							onNext={versionNav.goToNext}
							onCurrent={versionNav.goToCurrent}
						/>
					</div>
				)}

				{showChangesControls && changesViewState && (
					<div className="hidden md:block">
						<ChangesHeaderControls
							state={changesViewState}
							repo={metadata.repo}
							ydoc={ydoc}
						/>
					</div>
				)}
			</div>

			{showChangesControls && changesViewState && (
				<div className="md:hidden py-2 border-t border-separator/50 mt-1">
					<ChangesHeaderControls
						state={changesViewState}
						repo={metadata.repo}
						ydoc={ydoc}
						isMobile
					/>
				</div>
			)}
		</div>
	);
}

/**
 * Tabbed plan content viewer.
 * Shows Plan, Deliverables, and Changes tabs with their respective content.
 */
export function PlanContent(props: PlanContentProps) {
	const { ydoc, metadata, syncState } = props;
	const [activeView, setActiveView] = useState<PlanViewTab>(
		props.initialTab || "plan",
	);
	const [changesViewState, setChangesViewState] =
		useState<ChangesViewState | null>(null);

	const initialContent =
		props.mode === "snapshot" ? props.initialContent : undefined;
	const deliverableCount = useDeliverableCount(
		ydoc,
		props.mode,
		initialContent,
	);

	/** Handle tab change - updates state and notifies parent */
	const handleTabChange = useCallback(
		(tab: PlanViewTab) => {
			setActiveView(tab);
			props.onTabChange?.(tab);
		},
		[props.onTabChange],
	);

	/** Update activeView when initialTab changes */
	useEffect(() => {
		if (props.initialTab) {
			setActiveView(props.initialTab);
		}
	}, [props.initialTab]);

	/** Listen for external tab switch requests (e.g., from AgentRequestsBadge) */
	useEffect(() => {
		const handleSwitchTab = (event: Event) => {
			const tab = extractTabFromEvent(event);
			if (tab) {
				handleTabChange(tab);
			}
		};

		document.addEventListener("switch-plan-tab", handleSwitchTab);
		return () =>
			document.removeEventListener("switch-plan-tab", handleSwitchTab);
	}, [handleTabChange]);

	const versionNav = props.mode === "live" ? props.versionNav : undefined;

	return (
		<div className="flex flex-col h-full overflow-hidden">
			<TabNavigationBar
				activeView={activeView}
				onTabChange={handleTabChange}
				mode={props.mode}
				deliverableCount={deliverableCount}
				versionNav={versionNav}
				changesViewState={changesViewState}
				metadata={metadata}
				ydoc={ydoc}
			/>

			{activeView === "plan" && (
				<div className="flex-1 overflow-y-auto bg-background">
					<div className="grid grid-cols-[1fr_minmax(0,896px)_1fr] px-1 py-2 md:py-6">
						<div />
						<div className="md:px-6 space-y-3 md:space-y-6">
							<PlanTabContent
								mode={props.mode}
								ydoc={ydoc}
								identity={props.mode === "live" ? props.identity : undefined}
								provider={props.mode === "live" ? props.provider : undefined}
								onRequestIdentity={
									props.mode === "live" ? props.onRequestIdentity : undefined
								}
								currentSnapshot={
									props.mode === "live" ? props.currentSnapshot : undefined
								}
								onEditorReady={
									props.mode === "live" ? props.onEditorReady : undefined
								}
								initialContent={initialContent}
							/>
							<Attachments ydoc={ydoc} registryPort={syncState.registryPort} />
						</div>
						<div />
					</div>
				</div>
			)}

			{activeView === "activity" && (
				<div className="flex-1 overflow-y-auto bg-background">
					<div className="max-w-4xl mx-auto">
						<ActivityTimeline ydoc={ydoc} />
					</div>
				</div>
			)}

			{activeView === "deliverables" && (
				<div className="flex-1 overflow-y-auto bg-background">
					<DeliverablesView
						ydoc={ydoc}
						metadata={metadata}
						identity={props.mode === "live" ? props.identity : null}
						onRequestIdentity={
							props.mode === "live" ? props.onRequestIdentity : undefined
						}
						registryPort={syncState.registryPort}
					/>
				</div>
			)}

			{activeView === "changes" && (
				<div className="flex-1 overflow-y-auto bg-background">
					<ChangesView
						ydoc={ydoc}
						metadata={metadata}
						isActive={activeView === "changes"}
						onChangesViewState={setChangesViewState}
					/>
				</div>
			)}
		</div>
	);
}
