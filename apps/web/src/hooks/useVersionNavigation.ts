import { getSnapshots, type PlanSnapshot, YDOC_KEYS } from "@shipyard/schema";
import { useEffect, useState } from "react";
import type * as Y from "yjs";

/**
 * Base fields shared by all version navigation states.
 */
interface VersionNavigationBase {
	/** All available snapshots (sorted oldest to newest) */
	snapshots: PlanSnapshot[];
	/** Currently selected version index (0 = oldest, length-1 = newest/current, -1 = live) */
	currentIndex: number;
	/** Navigate to previous version */
	goToPrevious: () => void;
	/** Navigate to next version */
	goToNext: () => void;
	/** Go to current/live version */
	goToCurrent: () => void;
	/** Can navigate to previous version */
	canGoPrevious: boolean;
	/** Can navigate to next version */
	canGoNext: boolean;
}

/**
 * Version navigation state - discriminated union on isViewingHistory.
 * When viewing history, currentSnapshot is guaranteed to be a valid PlanSnapshot.
 * When viewing live (not history), currentSnapshot is null.
 */
export type VersionNavigationState =
	| (VersionNavigationBase & { isViewingHistory: false; currentSnapshot: null })
	| (VersionNavigationBase & {
			isViewingHistory: true;
			currentSnapshot: PlanSnapshot;
	  });

/**
 * Type guard for checking if viewing historical version.
 */
export function isViewingHistorySnapshot(
	state: VersionNavigationState,
): state is VersionNavigationBase & {
	isViewingHistory: true;
	currentSnapshot: PlanSnapshot;
} {
	return state.isViewingHistory;
}

/**
 * Hook for navigating between plan versions.
 * Subscribes to Y.Array(YDOC_KEYS.SNAPSHOTS) for real-time updates.
 *
 * @param ydoc - The Y.Doc containing the plan
 * @returns Version navigation state and controls
 */
export function useVersionNavigation(
	ydoc: Y.Doc | null,
): VersionNavigationState {
	const [snapshots, setSnapshots] = useState<PlanSnapshot[]>([]);
	const [currentIndex, setCurrentIndex] = useState<number>(-1);

	/** Subscribe to snapshots Y.Array */
	useEffect(() => {
		if (!ydoc) return;

		const updateSnapshots = () => {
			const allSnapshots = getSnapshots(ydoc);
			setSnapshots(allSnapshots);

			/** If viewing history and snapshots changed, stay on same relative position */
			setCurrentIndex((prevIndex) => {
				if (prevIndex === -1) return -1;
				return Math.min(prevIndex, allSnapshots.length - 1);
			});
		};

		/** Initial load */
		updateSnapshots();

		/** Subscribe to changes */
		const snapshotsArray = ydoc.getArray<PlanSnapshot>(YDOC_KEYS.SNAPSHOTS);
		snapshotsArray.observe(updateSnapshots);

		return () => snapshotsArray.unobserve(updateSnapshots);
	}, [ydoc]);

	const goToPrevious = () => {
		setCurrentIndex((prev) => {
			/** If viewing current, go to last snapshot */
			if (prev === -1) return snapshots.length - 1;
			/** Otherwise go back one */
			return Math.max(0, prev - 1);
		});
	};

	const goToNext = () => {
		setCurrentIndex((prev) => {
			/** If at last snapshot, go to current */
			if (prev === snapshots.length - 1) return -1;
			/** Otherwise go forward one */
			return prev + 1;
		});
	};

	const goToCurrent = () => {
		setCurrentIndex(-1);
	};

	const canGoPrevious =
		snapshots.length > 0 && (currentIndex > 0 || currentIndex === -1);
	const canGoNext = currentIndex >= 0;

	const base: VersionNavigationBase = {
		snapshots,
		currentIndex,
		goToPrevious,
		goToNext,
		goToCurrent,
		canGoPrevious,
		canGoNext,
	};

	const snapshot = currentIndex >= 0 ? snapshots[currentIndex] : undefined;

	if (currentIndex >= 0 && snapshot !== undefined) {
		return {
			...base,
			isViewingHistory: true,
			currentSnapshot: snapshot,
		};
	}

	return {
		...base,
		isViewingHistory: false,
		currentSnapshot: null,
	};
}
