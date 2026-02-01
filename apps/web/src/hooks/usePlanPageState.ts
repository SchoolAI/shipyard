/**
 * Hook to encapsulate all PlanPage state and logic.
 * Reduces cognitive complexity by moving state management out of the component.
 */

import type { BlockNoteEditor } from "@blocknote/core";
import { useOverlayState } from "@heroui/react";
import {
	addArtifact,
	type Deliverable,
	extractDeliverables,
	getPlanFromUrl,
	getPlanIndexEntry,
	getPlanMetadata,
	getPlanOwnerId,
	type PlanMetadata,
	setPlanIndexEntry,
	setPlanMetadata,
	YDOC_KEYS,
} from "@shipyard/schema";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import type { WebrtcProvider } from "y-webrtc";
import type { WebsocketProvider } from "y-websocket";
import * as Y from "yjs";
import { useActivePlanSync } from "@/contexts/ActivePlanSyncContext";
import { usePlanIndexContext } from "@/contexts/PlanIndexContext";
import { useGitHubAuth } from "@/hooks/useGitHubAuth";
import { useInputRequestModal } from "@/hooks/useInputRequestModal";
import { useInputRequests } from "@/hooks/useInputRequests";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useLocalIdentity } from "@/hooks/useLocalIdentity";
import { useMultiProviderSync } from "@/hooks/useMultiProviderSync";
import { useP2PGracePeriod } from "@/hooks/useP2PGracePeriod";
import { usePendingUserNotifications } from "@/hooks/usePendingUserNotifications";
import { useVersionNavigation } from "@/hooks/useVersionNavigation";
import { colorFromString } from "@/utils/color";

/** Identity type for BlockNote */
interface UserIdentity {
	id: string;
	name: string;
	color: string;
}

/** Loading state result for early returns */
export type LoadingStateResult =
	| { type: "loading" }
	| { type: "p2p-syncing"; peerCount: number }
	| { type: "peer-sync-timeout"; peerCount: number }
	| { type: "auth-required" }
	| { type: "not-found"; planId: string }
	| { type: "invalid-snapshot" }
	| { type: "ready"; metadata: PlanMetadata };

/** Return type for usePlanPageState */
export interface UsePlanPageStateReturn {
	/** Route params */
	routeId: string | undefined;
	planId: string;
	isSnapshot: boolean;
	urlPlan: ReturnType<typeof getPlanFromUrl>;

	/** Documents */
	ydoc: Y.Doc;
	indexDoc: Y.Doc;

	/** Providers */
	syncState: ReturnType<typeof useMultiProviderSync>["syncState"];
	wsProvider: WebsocketProvider | null;
	rtcProvider: WebrtcProvider | null;
	activeProvider: WebsocketProvider | WebrtcProvider | null;

	/** Identity */
	githubIdentity: ReturnType<typeof useGitHubAuth>["identity"];
	localIdentity: ReturnType<typeof useLocalIdentity>["localIdentity"];
	identity: UserIdentity | null;

	/** Auth state */
	authState: ReturnType<typeof useGitHubAuth>["authState"];
	startAuth: ReturnType<typeof useGitHubAuth>["startAuth"];
	showAuthChoice: boolean;
	setShowAuthChoice: (show: boolean) => void;
	showLocalSignIn: boolean;
	setShowLocalSignIn: (show: boolean) => void;

	/** Metadata */
	metadata: PlanMetadata | null;

	/** Loading state for early returns */
	loadingState: LoadingStateResult;

	/** UI state */
	isMobile: boolean;
	drawerState: ReturnType<typeof useOverlayState>;
	editor: BlockNoteEditor | null;

	/** Plans */
	allPlans: ReturnType<typeof usePlanIndexContext>["myPlans"];
	totalInboxCount: number;
	isLoading: boolean;

	/** Input request modal */
	inputRequestModal: ReturnType<typeof useInputRequestModal>;

	/** Version navigation */
	versionNav: ReturnType<typeof useVersionNavigation>;

	/** Handlers */
	handleRequestIdentity: () => void;
	handleLocalSignIn: (username: string) => void;
	handleEditorReady: (editor: BlockNoteEditor) => void;
	handleStatusChange: (
		newStatus: "in_progress" | "changes_requested",
		updatedAt: number,
	) => void;
	handleTagsChange: (newTags: string[]) => void;
}

/**
 * Hook that encapsulates all PlanPage state and logic.
 * Dramatically reduces the component's cognitive complexity.
 */
export function usePlanPageState(): UsePlanPageStateReturn {
	const { id: routeId } = useParams<{ id: string }>();
	const [searchParams] = useSearchParams();

	/**
	 * Memoize urlPlan based on the actual 'd' parameter value.
	 * getPlanFromUrl() returns a new object reference every call,
	 * which would cause snapshotYdoc to be recreated on every render,
	 * triggering infinite re-renders in child components.
	 */
	const encodedPlanData = searchParams.get("d");
	const urlPlan = useMemo(
		() => (encodedPlanData ? getPlanFromUrl() : null),
		[encodedPlanData],
	);
	const isSnapshot = urlPlan !== null;
	const planId = isSnapshot ? (urlPlan?.id ?? "") : (routeId ?? "");

	/** Sync providers */
	const {
		ydoc: syncedYdoc,
		syncState,
		wsProvider,
		rtcProvider,
	} = useMultiProviderSync(isSnapshot ? "" : planId);

	/** Snapshot Y.Doc */
	const snapshotYdoc = useMemo(() => {
		if (!isSnapshot || !urlPlan) return null;

		const doc = new Y.Doc();
		if (urlPlan.artifacts) {
			for (const artifact of urlPlan.artifacts) {
				addArtifact(doc, artifact);
			}
		}

		if (urlPlan.deliverables) {
			const deliverablesArray = doc.getArray<Deliverable>(
				YDOC_KEYS.DELIVERABLES,
			);
			const deliverablesWithIds = urlPlan.deliverables.map((d, i) => ({
				id: d.id ?? `deliverable-${i}`,
				text: d.text,
				linkedArtifactId: d.linkedArtifactId ?? undefined,
				linkedAt: d.linkedAt,
			}));
			deliverablesArray.push(deliverablesWithIds);
		} else if (urlPlan.content) {
			const deliverables = extractDeliverables(urlPlan.content);
			const deliverablesArray = doc.getArray<Deliverable>(
				YDOC_KEYS.DELIVERABLES,
			);
			deliverablesArray.push(deliverables);
		}

		return doc;
	}, [isSnapshot, urlPlan]);

	const ydoc = isSnapshot ? (snapshotYdoc ?? syncedYdoc) : syncedYdoc;

	/** Auth */
	const { identity: githubIdentity, startAuth, authState } = useGitHubAuth();
	const { localIdentity, setLocalIdentity } = useLocalIdentity();

	/** UI state */
	const isMobile = useIsMobile();
	const drawerState = useOverlayState();
	const { setActivePlanSync, clearActivePlanSync } = useActivePlanSync();
	const [metadata, setMetadata] = useState<PlanMetadata | null>(null);
	const [showAuthChoice, setShowAuthChoice] = useState(false);
	const [showLocalSignIn, setShowLocalSignIn] = useState(false);
	const [editor, setEditor] = useState<BlockNoteEditor | null>(null);

	/** Identity conversion */
	const identity: UserIdentity | null = githubIdentity
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

	/** Plan index context */
	const {
		ydoc: indexDoc,
		myPlans,
		sharedPlans,
		inboxPlans,
		isLoading,
	} = usePlanIndexContext();
	const { pendingRequests } = useInputRequests({ ydoc: indexDoc });
	const allPlans = useMemo(
		() => [...myPlans, ...sharedPlans, ...inboxPlans],
		[myPlans, sharedPlans, inboxPlans],
	);

	const totalInboxCount = useMemo(() => {
		return inboxPlans.length + pendingRequests.length;
	}, [inboxPlans, pendingRequests]);

	const activeProvider = isSnapshot ? null : (wsProvider ?? rtcProvider);

	/** Grace period */
	const { p2pGracePeriodExpired, peerSyncTimedOut } = useP2PGracePeriod(
		syncState,
		metadata,
	);

	/** Input request modal */
	const inputRequestModal = useInputRequestModal();

	/** Owner check */
	const ownerId = getPlanOwnerId(ydoc);
	const isOwner = !!(
		githubIdentity &&
		ownerId &&
		githubIdentity.username === ownerId
	);

	/** Notifications */
	usePendingUserNotifications(rtcProvider, isOwner);

	/** Version navigation */
	const versionNav = useVersionNavigation(isSnapshot ? null : ydoc);

	/** Metadata effect */
	useEffect(() => {
		if (isSnapshot && urlPlan) {
			setMetadata({
				id: urlPlan.id,
				title: urlPlan.title,
				status: "draft",
				repo: urlPlan.repo,
				pr: urlPlan.pr,
				createdAt: 0,
				updatedAt: 0,
			});
			return;
		}

		const metaMap = ydoc.getMap<PlanMetadata>(YDOC_KEYS.METADATA);
		const update = () => {
			const newMetadata = getPlanMetadata(ydoc);
			setMetadata(newMetadata);
		};
		update();
		metaMap.observe(update);
		return () => metaMap.unobserve(update);
	}, [ydoc, isSnapshot, urlPlan]);

	/** Active plan sync effect */
	useEffect(() => {
		setActivePlanSync(planId, syncState);
		return () => clearActivePlanSync();
	}, [planId, syncState, setActivePlanSync, clearActivePlanSync]);

	/** Mark deleted effect */
	useEffect(() => {
		if (syncState.synced && syncState.connected && !metadata) {
			const existingEntry = getPlanIndexEntry(indexDoc, planId);
			if (existingEntry && !existingEntry.deleted) {
				setPlanIndexEntry(indexDoc, {
					id: existingEntry.id,
					title: existingEntry.title,
					status: existingEntry.status,
					createdAt: existingEntry.createdAt,
					updatedAt: existingEntry.updatedAt,
					ownerId: existingEntry.ownerId,
					tags: existingEntry.tags,
					epoch: existingEntry.epoch,
					deleted: true,
					deletedAt: Date.now(),
					deletedBy: "Unknown",
				});
			}
		}
	}, [syncState.synced, syncState.connected, metadata, indexDoc, planId]);

	/** Handlers */
	const handleRequestIdentity = useCallback(() => {
		setShowAuthChoice(true);
	}, []);

	const handleLocalSignIn = useCallback(
		(username: string) => {
			setLocalIdentity(username);
			setShowLocalSignIn(false);
		},
		[setLocalIdentity],
	);

	const handleEditorReady = useCallback((editorInstance: BlockNoteEditor) => {
		setEditor(editorInstance);
	}, []);

	const handleStatusChange = useCallback(
		(newStatus: "in_progress" | "changes_requested", updatedAt: number) => {
			if (!metadata) return;

			const existingEntry = getPlanIndexEntry(indexDoc, planId);
			if (!existingEntry) return;

			setPlanIndexEntry(indexDoc, {
				...existingEntry,
				status: newStatus,
				updatedAt,
			});
		},
		[indexDoc, planId, metadata],
	);

	const handleTagsChange = useCallback(
		(newTags: string[]) => {
			if (!metadata || isSnapshot) return;

			setPlanMetadata(ydoc, { tags: newTags }, githubIdentity?.username);

			const existingEntry = getPlanIndexEntry(indexDoc, planId);
			if (existingEntry) {
				setPlanIndexEntry(indexDoc, {
					...existingEntry,
					tags: newTags,
					updatedAt: Date.now(),
				});
			}
		},
		[ydoc, indexDoc, planId, metadata, githubIdentity?.username, isSnapshot],
	);

	/** Compute loading state */
	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Loading state machine has many valid states (IDB sync, P2P sync, auth, timeouts) - splitting would fragment the logic
	const loadingState = useMemo((): LoadingStateResult => {
		if (!isSnapshot) {
			if (!syncState.idbSynced) {
				return { type: "loading" };
			}

			const inP2POnlyMode = syncState.idbSynced && !syncState.hubConnected;
			const waitingForP2P =
				inP2POnlyMode && !metadata && !p2pGracePeriodExpired;
			const hasPeersButNoData = syncState.peerCount > 0 && !metadata;

			if (peerSyncTimedOut && !metadata) {
				return { type: "peer-sync-timeout", peerCount: syncState.peerCount };
			}

			if (!metadata && (waitingForP2P || hasPeersButNoData)) {
				return { type: "p2p-syncing", peerCount: syncState.peerCount };
			}

			if (!metadata) {
				if (!githubIdentity) {
					return { type: "auth-required" };
				}
				return { type: "not-found", planId: routeId ?? "" };
			}
		}

		if (isSnapshot && !urlPlan) {
			return { type: "invalid-snapshot" };
		}

		if (!metadata) {
			return { type: "loading" };
		}

		return { type: "ready", metadata };
	}, [
		isSnapshot,
		syncState.idbSynced,
		syncState.hubConnected,
		syncState.peerCount,
		metadata,
		p2pGracePeriodExpired,
		peerSyncTimedOut,
		githubIdentity,
		routeId,
		urlPlan,
	]);

	return {
		routeId,
		planId,
		isSnapshot,
		urlPlan,
		ydoc,
		indexDoc,
		syncState,
		wsProvider,
		rtcProvider,
		activeProvider,
		githubIdentity,
		localIdentity,
		identity,
		authState,
		startAuth,
		showAuthChoice,
		setShowAuthChoice,
		showLocalSignIn,
		setShowLocalSignIn,
		metadata,
		loadingState,
		isMobile,
		drawerState,
		editor,
		allPlans,
		totalInboxCount,
		isLoading,
		inputRequestModal,
		versionNav,
		handleRequestIdentity,
		handleLocalSignIn,
		handleEditorReady,
		handleStatusChange,
		handleTagsChange,
	};
}
