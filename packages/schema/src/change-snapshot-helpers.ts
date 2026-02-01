import type * as Y from "yjs";
import {
	type ChangeSnapshot,
	ChangeSnapshotSchema,
} from "./change-snapshot.js";
import { YDOC_KEYS } from "./yjs-keys.js";

/**
 * Get all change snapshots from the Y.Doc.
 * Returns a Map of machineId -> ChangeSnapshot.
 */
export function getChangeSnapshots(ydoc: Y.Doc): Map<string, ChangeSnapshot> {
	const map = ydoc.getMap<ChangeSnapshot>(YDOC_KEYS.CHANGE_SNAPSHOTS);
	const result = new Map<string, ChangeSnapshot>();

	for (const [machineId, value] of map.entries()) {
		const parsed = ChangeSnapshotSchema.safeParse(value);
		if (parsed.success) {
			result.set(machineId, parsed.data);
		}
	}

	return result;
}

/**
 * Get a specific change snapshot by machineId.
 * Returns null if not found or invalid.
 */
export function getChangeSnapshot(
	ydoc: Y.Doc,
	machineId: string,
): ChangeSnapshot | null {
	const map = ydoc.getMap<ChangeSnapshot>(YDOC_KEYS.CHANGE_SNAPSHOTS);
	const value = map.get(machineId);
	if (!value) return null;

	const parsed = ChangeSnapshotSchema.safeParse(value);
	return parsed.success ? parsed.data : null;
}

/**
 * Set a change snapshot for a machine.
 * Validates the snapshot before writing to prevent CRDT corruption.
 */
export function setChangeSnapshot(
	ydoc: Y.Doc,
	snapshot: ChangeSnapshot,
	actor?: string,
): void {
	const validated = ChangeSnapshotSchema.parse(snapshot);

	ydoc.transact(
		() => {
			const map = ydoc.getMap<ChangeSnapshot>(YDOC_KEYS.CHANGE_SNAPSHOTS);
			map.set(validated.machineId, validated);
		},
		actor ? { actor } : undefined,
	);
}

/**
 * Mark a machine as disconnected by setting isLive to false.
 * This preserves the snapshot for remote viewers while indicating
 * the machine is no longer actively updating.
 *
 * @returns true if the snapshot was found and updated, false otherwise.
 */
export function markMachineDisconnected(
	ydoc: Y.Doc,
	machineId: string,
): boolean {
	let success = false;

	ydoc.transact(() => {
		const map = ydoc.getMap<ChangeSnapshot>(YDOC_KEYS.CHANGE_SNAPSHOTS);
		const value = map.get(machineId);
		if (!value) {
			success = false;
			return;
		}

		const parsed = ChangeSnapshotSchema.safeParse(value);
		if (!parsed.success) {
			success = false;
			return;
		}

		const updated: ChangeSnapshot = {
			...parsed.data,
			isLive: false,
			updatedAt: Date.now(),
		};

		map.set(machineId, updated);
		success = true;
	});

	return success;
}

/**
 * Remove a change snapshot for a machine.
 * Use markMachineDisconnected() instead if you want to preserve
 * the snapshot for remote viewers.
 *
 * @returns true if the snapshot was found and removed, false otherwise.
 */
export function removeChangeSnapshot(ydoc: Y.Doc, machineId: string): boolean {
	const map = ydoc.getMap<ChangeSnapshot>(YDOC_KEYS.CHANGE_SNAPSHOTS);
	if (!map.has(machineId)) return false;
	map.delete(machineId);
	return true;
}
