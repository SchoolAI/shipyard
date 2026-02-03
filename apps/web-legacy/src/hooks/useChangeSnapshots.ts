import {
	type ChangeSnapshot,
	getChangeSnapshots,
	YDOC_KEYS,
} from "@shipyard/schema";
import { useEffect, useState } from "react";
import type * as Y from "yjs";

export function useChangeSnapshots(ydoc: Y.Doc): Map<string, ChangeSnapshot> {
	const [snapshots, setSnapshots] = useState<Map<string, ChangeSnapshot>>(
		new Map(),
	);

	useEffect(() => {
		const map = ydoc.getMap<ChangeSnapshot>(YDOC_KEYS.CHANGE_SNAPSHOTS);

		const update = () => {
			setSnapshots(getChangeSnapshots(ydoc));
		};

		update();
		map.observe(update);
		return () => map.unobserve(update);
	}, [ydoc]);

	return snapshots;
}
