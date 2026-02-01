import { createContext, type ReactNode, useContext } from "react";
import { useGitHubAuth } from "@/hooks/useGitHubAuth";
import {
	type PlanIndexState,
	usePlanIndex as usePlanIndexHook,
} from "@/hooks/usePlanIndex";

/**
 * Context for sharing the plan index state across components.
 *
 * IMPORTANT: This context exists to prevent multiple WebrtcProvider instances
 * from being created for the same room. The usePlanIndex hook internally uses
 * useMultiProviderSync which creates a WebrtcProvider for "shipyard-plan-index".
 * y-webrtc throws an error if a room with the same name already exists.
 *
 * By using this context, we ensure only ONE usePlanIndex hook is called (in the provider)
 * and all consumers share that single instance.
 */
const PlanIndexContext = createContext<PlanIndexState | undefined>(undefined);

interface PlanIndexProviderProps {
	children: ReactNode;
}

/**
 * Provider that initializes the plan index sync and shares it with all consumers.
 * Must be placed inside GitHubAuthProvider to access the current user's identity.
 */
export function PlanIndexProvider({ children }: PlanIndexProviderProps) {
	const { identity: githubIdentity } = useGitHubAuth();
	const planIndexState = usePlanIndexHook(githubIdentity?.username);

	return (
		<PlanIndexContext.Provider value={planIndexState}>
			{children}
		</PlanIndexContext.Provider>
	);
}

/**
 * Hook to access the shared plan index state.
 * Must be used within a PlanIndexProvider.
 *
 * @throws Error if used outside of PlanIndexProvider
 */
export function usePlanIndexContext(): PlanIndexState {
	const context = useContext(PlanIndexContext);
	if (!context) {
		throw new Error(
			"usePlanIndexContext must be used within a PlanIndexProvider",
		);
	}
	return context;
}
