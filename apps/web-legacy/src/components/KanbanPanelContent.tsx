/**
 * Content component for the Kanban slide-out panel.
 * Handles rendering of plan content, header, and loading state.
 */

import { Spinner } from "@heroui/react";
import type { PlanMetadata } from "@shipyard/schema";
import type { WebrtcProvider } from "y-webrtc";
import type { WebsocketProvider } from "y-websocket";
import type * as Y from "yjs";
import { PlanContent } from "@/components/PlanContent";
import { PlanPanelHeader } from "@/components/PlanPanelHeader";
import type { KanbanIdentity } from "@/hooks/useKanbanAuth";
import type { DeliverableStats } from "@/hooks/useKanbanPanelData";
import type { SyncState } from "@/hooks/useMultiProviderSync";
import type { PanelWidth } from "@/hooks/usePanelState";

export interface KanbanPanelContentProps {
	selectedPlanId: string | null;
	panelMetadata: PlanMetadata | null;
	panelDeliverableStats: DeliverableStats;
	panelLastActivity: string;
	panelYdoc: Y.Doc;
	panelSyncState: SyncState;
	identity: KanbanIdentity | null;
	activeProvider: WebsocketProvider | WebrtcProvider | null;
	panelWidth: PanelWidth;
	onApprove: () => Promise<void>;
	onRequestChanges: () => void;
	onClose: () => void;
	onExpand: () => void;
	onFullScreen: () => void;
	onRequestIdentity: () => void;
}

/**
 * Renders the content of the Kanban slide-out panel.
 * Shows loading spinner, plan content, or nothing based on state.
 */
export function KanbanPanelContent({
	selectedPlanId,
	panelMetadata,
	panelDeliverableStats,
	panelLastActivity,
	panelYdoc,
	panelSyncState,
	identity,
	activeProvider,
	panelWidth,
	onApprove,
	onRequestChanges,
	onClose,
	onExpand,
	onFullScreen,
	onRequestIdentity,
}: KanbanPanelContentProps) {
	if (!selectedPlanId) {
		return null;
	}

	if (!panelMetadata) {
		return (
			<div className="flex items-center justify-center h-full">
				<div className="flex flex-col items-center gap-4">
					<Spinner size="lg" />
					<p className="text-muted-foreground">Loading task...</p>
				</div>
			</div>
		);
	}

	return (
		<>
			<PlanPanelHeader
				metadata={panelMetadata}
				deliverableStats={panelDeliverableStats}
				lastActivityText={panelLastActivity}
				onApprove={onApprove}
				onRequestChanges={onRequestChanges}
				onClose={onClose}
				onExpand={onExpand}
				onFullScreen={onFullScreen}
				width={panelWidth}
			/>
			<PlanContent
				mode="live"
				ydoc={panelYdoc}
				metadata={panelMetadata}
				syncState={panelSyncState}
				identity={identity}
				onRequestIdentity={onRequestIdentity}
				provider={activeProvider}
			/>
		</>
	);
}
