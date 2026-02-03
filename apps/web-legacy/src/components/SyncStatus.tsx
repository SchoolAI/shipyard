import { Chip } from "@heroui/react";

interface SyncStatusProps {
	synced: boolean;
	/** Connected to hub WebSocket */
	hubConnected?: boolean;
	/** Number of P2P peers connected */
	peerCount?: number;
}

export function SyncStatus({
	synced,
	hubConnected = false,
	peerCount = 0,
}: SyncStatusProps) {
	const getConnectionDetails = () => {
		const parts: string[] = [];
		if (hubConnected) parts.push("hub");
		if (peerCount > 0) parts.push(`${peerCount} P2P`);
		return parts.length > 0 ? ` (${parts.join(", ")})` : "";
	};

	const hasAnyConnection = hubConnected || peerCount > 0;

	if (!hasAnyConnection) {
		return (
			<Chip color="warning" variant="soft">
				Offline - viewing snapshot
			</Chip>
		);
	}

	if (!synced) {
		return (
			<Chip color="accent" variant="soft">
				Syncing...{getConnectionDetails()}
			</Chip>
		);
	}

	return (
		<Chip color="success" variant="soft">
			Synced{getConnectionDetails()}
		</Chip>
	);
}
