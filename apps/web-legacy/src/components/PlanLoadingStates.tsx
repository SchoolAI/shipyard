/**
 * Loading state components for PlanPage.
 * Handles various loading, error, and authentication states.
 */

import { Button, Spinner } from "@heroui/react";
import { LogIn } from "lucide-react";

/*
 * =====================================================================
 * Initial Loading State
 * =====================================================================
 */

export function InitialLoadingState() {
	return (
		<div className="flex items-center justify-center min-h-[50vh] p-4">
			<div className="flex flex-col items-center gap-4">
				<Spinner size="lg" />
				<p className="text-muted-foreground">Loading task...</p>
			</div>
		</div>
	);
}

/*
 * =====================================================================
 * P2P Sync States
 * =====================================================================
 */

interface P2PSyncingStateProps {
	peerCount: number;
}

export function P2PSyncingState({ peerCount }: P2PSyncingStateProps) {
	return (
		<div className="flex items-center justify-center min-h-[50vh] p-4">
			<div className="flex flex-col items-center gap-4 text-center max-w-md">
				<Spinner size="lg" />
				<div>
					<p className="text-foreground font-medium mb-2">
						{peerCount > 0
							? `Syncing from ${peerCount} peer${peerCount > 1 ? "s" : ""}...`
							: "Waiting for peers..."}
					</p>
					<p className="text-sm text-muted-foreground">
						This task is shared via P2P. It may take a moment to connect.
					</p>
				</div>
			</div>
		</div>
	);
}

interface PeerSyncTimeoutStateProps {
	peerCount: number;
}

export function PeerSyncTimeoutState({ peerCount }: PeerSyncTimeoutStateProps) {
	return (
		<div className="flex items-center justify-center min-h-[50vh] p-4">
			<div className="flex flex-col items-center gap-4 text-center max-w-md">
				<div className="w-12 h-12 rounded-full bg-danger/10 flex items-center justify-center">
					<span className="text-danger text-2xl">!</span>
				</div>
				<div>
					<p className="text-foreground font-medium mb-2">Sync Failed</p>
					<p className="text-sm text-muted-foreground mb-4">
						Connected to {peerCount} peer{peerCount > 1 ? "s" : ""} but
						couldn&apos;t load task data. The peer may not have the plan
						you&apos;re looking for.
					</p>
				</div>
				<Button variant="primary" onPress={() => window.location.reload()}>
					Retry
				</Button>
			</div>
		</div>
	);
}

/*
 * =====================================================================
 * Authentication States
 * =====================================================================
 */

interface AuthRequiredStateProps {
	onStartAuth: () => void;
}

export function AuthRequiredState({ onStartAuth }: AuthRequiredStateProps) {
	return (
		<div className="flex items-center justify-center min-h-[60vh] p-4">
			<div className="bg-surface border border-separator rounded-lg p-8 max-w-md w-full text-center">
				<div className="flex justify-center mb-6">
					<LogIn className="w-12 h-12 text-primary" />
				</div>

				<h1 className="text-xl font-semibold text-foreground mb-2">
					Authentication Required
				</h1>

				<p className="text-muted-foreground mb-4">
					Sign in with GitHub to access this task.
				</p>

				<p className="text-sm text-muted-foreground mb-6">
					If you own this task or have been granted access, you'll be able to
					view it after signing in.
				</p>

				<Button onPress={onStartAuth} variant="primary" className="w-full">
					<LogIn className="w-4 h-4" />
					Sign in with GitHub
				</Button>
			</div>
		</div>
	);
}

/*
 * =====================================================================
 * Not Found States
 * =====================================================================
 */

interface PlanNotFoundStateProps {
	planId: string;
}

export function PlanNotFoundState({ planId }: PlanNotFoundStateProps) {
	return (
		<div className="p-8 text-center">
			<h1 className="text-xl font-bold text-foreground">Task Not Found</h1>
			<p className="text-muted-foreground">
				The task &quot;{planId}&quot; does not exist.
			</p>
			<p className="text-sm text-muted-foreground mt-2">
				The task owner may be offline, or this link may be invalid.
			</p>
		</div>
	);
}

export function InvalidSnapshotState() {
	return (
		<div className="p-8 text-center">
			<h1 className="text-xl font-bold text-foreground">Invalid Snapshot</h1>
			<p className="text-muted-foreground">
				The URL does not contain valid task data.
			</p>
		</div>
	);
}

export function MetadataLoadingState() {
	return (
		<div className="p-8">
			<p className="text-muted-foreground">Loading...</p>
		</div>
	);
}
