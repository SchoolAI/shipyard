/**
 * Unified modal for starting an agent (Claude Code) or creating tasks.
 * Supports both:
 * - Creating new tasks from scratch
 * - Launching from received A2A conversations
 *
 * Plans are created in the browser using Yjs with multi-provider sync:
 * - IndexedDB: Local persistence for offline support
 * - WebSocket: Sync with registry server when available
 * - WebRTC: P2P sync for mobile and multi-device scenarios
 *
 * Agent launch paths (in order of preference):
 * 1. Local daemon: Uses daemon WebSocket (fastest, default for desktop)
 * 2. P2P peer daemon: Launches via connected peer with daemon (mobile fallback)
 * 3. Browser-only: Creates plan without launching agent (no daemon available)
 *
 * @see Issue #218 - A2A for Daemon (P2P Agent Launching)
 */

import type {
	A2AMessage,
	ConversationExportMeta,
	OriginPlatform,
} from "@shipyard/schema";
import { addConversationVersion, OriginPlatformValues } from "@shipyard/schema";

function isOriginPlatform(value: string | undefined): value is OriginPlatform {
	if (value === undefined) return false;
	return OriginPlatformValues.some((p) => p === value);
}

import { Button, Card, Label, Modal, TextArea, TextField } from "@heroui/react";
import confetti from "canvas-confetti";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type * as Y from "yjs";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { usePlanIndexContext } from "@/contexts/PlanIndexContext";
import { useUserIdentity } from "@/contexts/UserIdentityContext";
import { useDaemon } from "@/hooks/useDaemon";
import { useGitHubAuth } from "@/hooks/useGitHubAuth";
import type { ConnectedPeer } from "@/hooks/useP2PPeers";
import { createPlanBrowserOnly } from "@/utils/createPlanBrowserOnly";
import type {
	P2PAgentLaunchOptions,
	P2PAgentLaunchResult,
} from "@/utils/P2PAgentLaunchManager";
import { injectShipyardContext } from "@/utils/shipyardContextInjector";
import { DaemonWarning } from "./DaemonWarning";
import { SuccessAlert } from "./SuccessAlert";

export interface StartAgentModalProps {
	isOpen: boolean;
	onClose: () => void;
	/** Optional A2A conversation to launch with */
	a2aConversation?: {
		messages: A2AMessage[];
		meta: ConversationExportMeta;
		summary: { title: string; text: string };
	};
	/** Working directory for agent (defaults to /tmp) */
	cwd?: string;
	/**
	 * Peers that have daemon access for P2P launching.
	 * @see Issue #218 - A2A for Daemon (P2P Agent Launching)
	 */
	peersWithDaemon?: ConnectedPeer[];
	/**
	 * Callback to launch agent via P2P peer.
	 * @see Issue #218 - A2A for Daemon (P2P Agent Launching)
	 */
	launchViaP2P?: (
		peerId: string,
		options: P2PAgentLaunchOptions,
	) => Promise<P2PAgentLaunchResult>;
}

type CreationPhase =
	| "idle"
	| "creating-plan"
	| "injecting-context"
	| "launching"
	| "launching-p2p"
	| "done"
	| "success"
	| "plan-created-no-agent";

/** Update CRDT with conversation version when agent starts with A2A context */
function updateCrdtWithVersion(
	ydoc: Y.Doc,
	a2aConversation: NonNullable<StartAgentModalProps["a2aConversation"]>,
	lastStarted: { sessionId?: string },
	username: string | undefined,
) {
	const sourcePlatform = a2aConversation.meta.sourcePlatform;
	const platform: OriginPlatform = isOriginPlatform(sourcePlatform)
		? sourcePlatform
		: "unknown";

	const newVersion = {
		versionId: crypto.randomUUID(),
		creator: username || "anonymous",
		platform,
		sessionId: lastStarted.sessionId || a2aConversation.meta.sourceSessionId,
		messageCount: a2aConversation.meta.messageCount,
		createdAt: Date.now(),
		handedOff: false as const,
	};
	addConversationVersion(ydoc, newVersion);
}

/** Fire celebratory confetti animation */
function fireConfetti(triggeredRef: React.MutableRefObject<boolean>) {
	if (triggeredRef.current) return;
	triggeredRef.current = true;

	const duration = 1500;
	const end = Date.now() + duration;

	const frame = () => {
		confetti({
			particleCount: 3,
			angle: 60,
			spread: 55,
			origin: { x: 0, y: 0.7 },
			colors: ["#10b981", "#34d399", "#6ee7b7", "#a7f3d0"],
		});
		confetti({
			particleCount: 3,
			angle: 120,
			spread: 55,
			origin: { x: 1, y: 0.7 },
			colors: ["#10b981", "#34d399", "#6ee7b7", "#a7f3d0"],
		});

		if (Date.now() < end) {
			requestAnimationFrame(frame);
		}
	};

	frame();

	confetti({
		particleCount: 100,
		spread: 70,
		origin: { y: 0.6 },
		colors: ["#10b981", "#34d399", "#6ee7b7", "#a7f3d0", "#fbbf24", "#f59e0b"],
	});
}

/** Get the submit button label based on connection and conversation state */
function getSubmitLabel(
	connected: boolean,
	hasA2aConversation: boolean,
): string {
	if (!connected) return "Create Task";
	return hasA2aConversation ? "Launch with Conversation" : "Start Agent";
}

/** Handle daemon error and reset state */
function handleDaemonError(
	lastError: string,
	lastErrorRef: React.MutableRefObject<string | null>,
	setCreationPhase: (phase: CreationPhase) => void,
	setProgress: (progress: number) => void,
	setPendingPlanId: (id: string | null) => void,
) {
	toast.error(`Agent launch failed: ${lastError}`);
	setCreationPhase("idle");
	setProgress(0);
	setPendingPlanId(null);
	lastErrorRef.current = lastError;
}

/**
 * Unified modal for starting agents.
 * Handles both simple task creation and launching from A2A conversations.
 */
export function StartAgentModal({
	isOpen,
	onClose,
	a2aConversation,
	cwd = "/tmp",
	peersWithDaemon: _peersWithDaemon = [],
	launchViaP2P: _launchViaP2P,
}: StartAgentModalProps) {
	const [prompt, setPrompt] = useState("");
	const [creationPhase, setCreationPhase] = useState<CreationPhase>("idle");
	const [progress, setProgress] = useState(0);
	const [pendingPlanId, setPendingPlanId] = useState<string | null>(null);
	const [pendingPlanYdoc, setPendingPlanYdoc] = useState<Y.Doc | null>(null);
	const [successInfo, setSuccessInfo] = useState<{
		pid: number;
		planId: string;
	} | null>(null);
	const {
		startAgent,
		startAgentWithContext,
		connected,
		lastStarted,
		lastError,
	} = useDaemon();
	const { actor } = useUserIdentity();
	const { identity } = useGitHubAuth();
	const { ydoc: indexDoc } = usePlanIndexContext();
	const successTimeoutRef = useRef<number | null>(null);
	const confettiTriggered = useRef(false);
	const lastErrorRef = useRef<string | null>(null);
	const browserPlanCleanupRef = useRef<(() => void) | null>(null);

	const isProcessing =
		creationPhase !== "idle" &&
		creationPhase !== "success" &&
		creationPhase !== "plan-created-no-agent";

	const handleFireConfetti = useCallback(() => {
		fireConfetti(confettiTriggered);
	}, []);

	useEffect(() => {
		const shouldShowSuccess =
			lastStarted &&
			pendingPlanId === lastStarted.taskId &&
			creationPhase === "done";

		if (!shouldShowSuccess) return;

		if (pendingPlanYdoc && a2aConversation) {
			updateCrdtWithVersion(
				pendingPlanYdoc,
				a2aConversation,
				lastStarted,
				identity?.username,
			);
		}

		setSuccessInfo({ pid: lastStarted.pid, planId: pendingPlanId });
		setCreationPhase("success");
		handleFireConfetti();
	}, [
		lastStarted,
		pendingPlanId,
		creationPhase,
		pendingPlanYdoc,
		a2aConversation,
		identity?.username,
		handleFireConfetti,
	]);

	useEffect(() => {
		const isWaitingForDaemon =
			creationPhase === "done" || creationPhase === "launching";
		const isNewError = lastError && lastError !== lastErrorRef.current;

		if (isNewError && isWaitingForDaemon) {
			handleDaemonError(
				lastError,
				lastErrorRef,
				setCreationPhase,
				setProgress,
				setPendingPlanId,
			);
		}
	}, [lastError, creationPhase]);

	useEffect(() => {
		return () => {
			if (successTimeoutRef.current !== null) {
				clearTimeout(successTimeoutRef.current);
			}
		};
	}, []);

	async function createPlan(title: string): Promise<{
		planId: string;
		sessionToken: string;
		url: string;
		ydoc: Y.Doc;
	}> {
		const result = await createPlanBrowserOnly({
			title,
			ownerId: actor || "anonymous",
			indexDoc,
		});

		browserPlanCleanupRef.current = result.cleanup;

		return {
			planId: result.planId,
			sessionToken: result.sessionToken,
			url: result.url,
			ydoc: result.ydoc,
		};
	}

	function launchWithA2A(planId: string, sessionToken: string, webUrl: string) {
		if (!a2aConversation) return;

		const messagesWithContext = injectShipyardContext(
			a2aConversation.messages,
			{
				planId,
				sessionToken,
				webUrl,
				additionalPrompt: prompt || undefined,
			},
		);

		startAgentWithContext(
			planId,
			{
				messages: messagesWithContext,
				meta: { ...a2aConversation.meta, planId },
			},
			cwd,
		);
	}

	function launchAgentLocally(
		planId: string,
		sessionToken: string,
		webUrl: string,
	) {
		setProgress(66);
		setCreationPhase("launching");
		setProgress(80);
		setPendingPlanId(planId);

		if (a2aConversation) {
			launchWithA2A(planId, sessionToken, webUrl);
		} else {
			startAgent(planId, prompt.trim());
		}
	}

	function handleBrowserOnlyMode(planId: string) {
		setProgress(100);
		setSuccessInfo({ pid: 0, planId });
		setCreationPhase("plan-created-no-agent");
	}

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();

		if (!a2aConversation && !prompt.trim()) return;

		lastErrorRef.current = null;

		setCreationPhase("creating-plan");
		setProgress(10);

		try {
			const title =
				a2aConversation?.summary.title || prompt.slice(0, 100) || "Agent Task";

			const {
				planId,
				sessionToken,
				url: webUrl,
				ydoc: planYdoc,
			} = await createPlan(title);

			setPendingPlanYdoc(planYdoc);
			setProgress(33);

			if (!connected) {
				handleBrowserOnlyMode(planId);
				return;
			}

			setCreationPhase("injecting-context");
			setProgress(50);
			launchAgentLocally(planId, sessionToken, webUrl);

			setProgress(100);
			setCreationPhase("done");
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: "Failed to create plan. Please try again.";
			toast.error(message);
			setCreationPhase("idle");
			setProgress(0);
		}
	};

	const handleCancel = () => {
		if (successTimeoutRef.current !== null) {
			clearTimeout(successTimeoutRef.current);
			successTimeoutRef.current = null;
		}
		setPrompt("");
		setCreationPhase("idle");
		setProgress(0);
		setPendingPlanId(null);
		setSuccessInfo(null);
		confettiTriggered.current = false;
		onClose();
	};

	const showSuccess =
		creationPhase === "success" || creationPhase === "plan-created-no-agent";
	const submitLabel = getSubmitLabel(connected, !!a2aConversation);

	return (
		<Modal.Backdrop
			isOpen={isOpen}
			onOpenChange={(open) => !open && handleCancel()}
			isDismissable={!isProcessing}
			isKeyboardDismissDisabled={isProcessing}
		>
			<Modal.Container placement="center" size="md">
				<Modal.Dialog>
					<Modal.CloseTrigger />

					<Card>
						<Card.Header>
							<h2 className="text-xl font-semibold">Start Agent</h2>
						</Card.Header>

						<Card.Content>
							<form onSubmit={handleSubmit} className="space-y-4">
								{a2aConversation && (
									<div className="mb-4 p-3 bg-surface-secondary rounded-lg">
										<p className="text-sm font-medium mb-1">
											Importing conversation from{" "}
											{a2aConversation.meta.sourcePlatform}
										</p>
										<p className="text-xs text-muted-foreground">
											{a2aConversation.meta.messageCount} messages
										</p>
										{a2aConversation.summary.text && (
											<p className="text-xs text-muted-foreground mt-1">
												{a2aConversation.summary.text}
											</p>
										)}
									</div>
								)}

								<TextField
									isRequired={!a2aConversation}
									isDisabled={isProcessing}
								>
									<Label>
										{a2aConversation
											? "Additional instructions (optional)"
											: "Task prompt"}
									</Label>
									<TextArea
										value={prompt}
										onChange={(e) => setPrompt(e.target.value)}
										placeholder={
											a2aConversation
												? "Add any additional instructions for the agent..."
												: "Describe what you want the agent to do..."
										}
										autoFocus
										minLength={a2aConversation ? 0 : 5}
										rows={4}
									/>
									<p className="text-xs text-muted-foreground mt-1">
										{a2aConversation
											? "Agent will continue the imported conversation."
											: "Claude Code will work on this task autonomously."}
									</p>
								</TextField>

								{isProcessing && (
									<ProgressBar
										progress={progress}
										stage={creationPhase.replace("-", " ")}
									/>
								)}

								{creationPhase === "success" && successInfo && (
									<SuccessAlert
										successInfo={successInfo}
										variant="agent-launched"
									/>
								)}

								{creationPhase === "plan-created-no-agent" && successInfo && (
									<SuccessAlert
										successInfo={successInfo}
										variant="plan-created"
									/>
								)}

								{!connected && creationPhase === "idle" && <DaemonWarning />}

								<div className="flex gap-2 justify-end pt-2">
									{showSuccess ? (
										<Button
											variant="secondary"
											onPress={handleCancel}
											type="button"
										>
											Close
										</Button>
									) : (
										<>
											<Button
												variant="secondary"
												onPress={handleCancel}
												isDisabled={isProcessing}
												type="button"
											>
												Cancel
											</Button>
											<Button
												type="submit"
												isDisabled={
													creationPhase !== "idle" ||
													(!a2aConversation && !prompt.trim())
												}
												isPending={isProcessing}
												variant="primary"
											>
												{submitLabel}
											</Button>
										</>
									)}
								</div>
							</form>
						</Card.Content>
					</Card>
				</Modal.Dialog>
			</Modal.Container>
		</Modal.Backdrop>
	);
}
