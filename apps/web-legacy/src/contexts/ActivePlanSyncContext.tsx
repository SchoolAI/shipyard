import { createContext, type ReactNode, useContext, useState } from "react";
import type { SyncState } from "@/hooks/useMultiProviderSync";

interface ActivePlanSyncContextValue {
	activePlanId: string | null;
	syncState: SyncState | null;
	setActivePlanSync: (planId: string, syncState: SyncState) => void;
	clearActivePlanSync: () => void;
}

const ActivePlanSyncContext = createContext<
	ActivePlanSyncContextValue | undefined
>(undefined);

export function ActivePlanSyncProvider({ children }: { children: ReactNode }) {
	const [activePlanId, setActivePlanId] = useState<string | null>(null);
	const [syncState, setSyncState] = useState<SyncState | null>(null);

	const setActivePlanSync = (planId: string, state: SyncState) => {
		setActivePlanId(planId);
		setSyncState(state);
	};

	const clearActivePlanSync = () => {
		setActivePlanId(null);
		setSyncState(null);
	};

	return (
		<ActivePlanSyncContext.Provider
			value={{
				activePlanId,
				syncState,
				setActivePlanSync,
				clearActivePlanSync,
			}}
		>
			{children}
		</ActivePlanSyncContext.Provider>
	);
}

export function useActivePlanSync() {
	const context = useContext(ActivePlanSyncContext);
	if (!context) {
		throw new Error(
			"useActivePlanSync must be used within ActivePlanSyncProvider",
		);
	}
	return context;
}
