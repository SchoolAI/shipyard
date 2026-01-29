/**
 * Unified modal for starting an agent (Claude Code).
 * Supports both:
 * - Creating new tasks from scratch
 * - Launching from received A2A conversations
 *
 * Both paths auto-create Shipyard plans with session tokens via tRPC.
 */

import type { A2AMessage, ConversationExportMeta, OriginPlatform } from '@shipyard/schema';
import { addConversationVersion, OriginPlatformValues } from '@shipyard/schema';
import { DEFAULT_REGISTRY_PORTS } from '@shipyard/shared/registry-config';

function isOriginPlatform(value: string | undefined): value is OriginPlatform {
  return OriginPlatformValues.includes(value as OriginPlatform);
}

import { Alert, Button, Card, Label, Link, Modal, TextArea, TextField } from '@heroui/react';
import confetti from 'canvas-confetti';
import { CheckCircle2, ExternalLink } from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import type * as Y from 'yjs';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { getPlanRoute } from '@/constants/routes';
import { useUserIdentity } from '@/contexts/UserIdentityContext';
import { useDaemon } from '@/hooks/useDaemon';
import { useGitHubAuth } from '@/hooks/useGitHubAuth';
import { injectShipyardContext } from '@/utils/shipyardContextInjector';
import { createVanillaTRPCClient } from '@/utils/trpc-client';

interface StartAgentModalProps {
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
}

type CreationPhase =
  | 'idle'
  | 'creating-plan'
  | 'injecting-context'
  | 'launching'
  | 'done'
  | 'success';

/**
 * Discover the registry server URL by checking known ports.
 * Tries DEFAULT_REGISTRY_PORTS to find a running server.
 */
async function discoverRegistryUrl(): Promise<string | null> {
  const envPort = import.meta.env.VITE_REGISTRY_PORT;
  const ports = envPort ? [Number.parseInt(envPort, 10)] : DEFAULT_REGISTRY_PORTS;

  for (const port of ports) {
    try {
      const res = await fetch(`http://localhost:${port}/registry`, {
        signal: AbortSignal.timeout(1000),
      });
      if (res.ok) {
        return `http://localhost:${port}`;
      }
    } catch {
      /** Continue to next port */
    }
  }

  return null;
}

/** Update CRDT with conversation version when agent starts with A2A context */
function updateCrdtWithVersion(
  ydoc: Y.Doc,
  a2aConversation: NonNullable<StartAgentModalProps['a2aConversation']>,
  lastStarted: { sessionId?: string },
  username: string | undefined
) {
  const sourcePlatform = a2aConversation.meta.sourcePlatform;
  const platform: OriginPlatform = isOriginPlatform(sourcePlatform) ? sourcePlatform : 'unknown';

  const newVersion = {
    versionId: crypto.randomUUID(),
    creator: username || 'anonymous',
    platform,
    sessionId: lastStarted.sessionId || a2aConversation.meta.sourceSessionId,
    messageCount: a2aConversation.meta.messageCount,
    createdAt: Date.now(),
    handedOff: false as const,
  };
  addConversationVersion(ydoc, newVersion);
}

/**
 * Unified modal for starting agents.
 * Handles both simple task creation and launching from A2A conversations.
 * Auto-creates Shipyard plans with session tokens via tRPC for proper server-side syncing.
 */
export function StartAgentModal({
  isOpen,
  onClose,
  a2aConversation,
  cwd = '/tmp',
}: StartAgentModalProps) {
  const [prompt, setPrompt] = useState('');
  const [creationPhase, setCreationPhase] = useState<CreationPhase>('idle');
  const [progress, setProgress] = useState(0);
  const [pendingPlanId, setPendingPlanId] = useState<string | null>(null);
  const [pendingPlanYdoc, setPendingPlanYdoc] = useState<Y.Doc | null>(null);
  const [successInfo, setSuccessInfo] = useState<{ pid: number; planId: string } | null>(null);
  const { startAgent, startAgentWithContext, connected, lastStarted, lastError } = useDaemon();
  const { actor } = useUserIdentity();
  const { identity } = useGitHubAuth();
  const successTimeoutRef = useRef<number | null>(null);
  const confettiTriggered = useRef(false);
  const lastErrorRef = useRef<string | null>(null);

  const isProcessing = creationPhase !== 'idle' && creationPhase !== 'success';

  /** Fire celebratory confetti animation */
  const fireConfetti = useCallback(() => {
    if (confettiTriggered.current) return;
    confettiTriggered.current = true;

    const duration = 1500;
    const end = Date.now() + duration;

    const frame = () => {
      confetti({
        particleCount: 3,
        angle: 60,
        spread: 55,
        origin: { x: 0, y: 0.7 },
        colors: ['#10b981', '#34d399', '#6ee7b7', '#a7f3d0'],
      });
      confetti({
        particleCount: 3,
        angle: 120,
        spread: 55,
        origin: { x: 1, y: 0.7 },
        colors: ['#10b981', '#34d399', '#6ee7b7', '#a7f3d0'],
      });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    };

    frame();

    // Also fire a burst from center
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#10b981', '#34d399', '#6ee7b7', '#a7f3d0', '#fbbf24', '#f59e0b'],
    });
  }, []);

  /** Handle success when agent starts */
  useEffect(() => {
    const shouldShowSuccess =
      lastStarted && pendingPlanId === lastStarted.taskId && creationPhase === 'done';

    if (!shouldShowSuccess) return;

    /** Update CRDT with actual sessionId from daemon */
    if (pendingPlanYdoc && a2aConversation) {
      updateCrdtWithVersion(pendingPlanYdoc, a2aConversation, lastStarted, identity?.username);
    }

    /** Show success state and fire confetti */
    setSuccessInfo({ pid: lastStarted.pid, planId: pendingPlanId });
    setCreationPhase('success');
    fireConfetti();

    /** Don't auto-close - let user navigate to plan URL or close manually */
  }, [
    lastStarted,
    pendingPlanId,
    creationPhase,
    pendingPlanYdoc,
    a2aConversation,
    identity?.username,
    fireConfetti,
  ]);

  /** Monitor daemon errors and show toast */
  useEffect(() => {
    if (lastError && lastError !== lastErrorRef.current && isProcessing) {
      toast.error(`Agent launch failed: ${lastError}`);
      setCreationPhase('idle');
      setProgress(0);
      lastErrorRef.current = lastError;
    }
  }, [lastError, isProcessing]);

  /** Cleanup timeout on unmount */
  useEffect(() => {
    return () => {
      if (successTimeoutRef.current !== null) {
        clearTimeout(successTimeoutRef.current);
      }
    };
  }, []);

  /**
   * Create a plan via tRPC for proper server-side syncing.
   * The server handles Y.Doc creation via getOrCreateDoc(), ensuring
   * the plan is properly synced to all connected clients.
   */
  async function createPlan(
    title: string
  ): Promise<{ planId: string; sessionToken: string; url: string }> {
    const registryUrl = await discoverRegistryUrl();

    if (!registryUrl) {
      throw new Error('Could not connect to Shipyard server. Make sure the server is running.');
    }

    const trpc = createVanillaTRPCClient(registryUrl);
    const ownerId = actor || 'anonymous';

    const result = await trpc.plan.create.mutate({
      title,
      ownerId,
    });

    return result;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!connected || (!a2aConversation && !prompt.trim())) return;

    setCreationPhase('creating-plan');
    setProgress(10);

    try {
      const title = a2aConversation?.summary.title || prompt.slice(0, 100) || 'Agent Task';
      const { planId, sessionToken, url: webUrl } = await createPlan(title);

      /** The plan Y.Doc is created on the server, so we don't have a local reference */
      setPendingPlanYdoc(null);

      setProgress(33);
      setCreationPhase('injecting-context');
      setProgress(50);

      if (a2aConversation) {
        const messagesWithContext = injectShipyardContext(a2aConversation.messages, {
          planId,
          sessionToken,
          webUrl,
          additionalPrompt: prompt || undefined,
        });

        setProgress(66);
        setCreationPhase('launching');
        setProgress(80);

        startAgentWithContext(
          planId,
          {
            messages: messagesWithContext,
            meta: { ...a2aConversation.meta, planId },
          },
          cwd
        );

        setPendingPlanId(planId);
      } else {
        setProgress(66);
        setCreationPhase('launching');
        setProgress(80);

        setPendingPlanId(planId);
        startAgent(planId, prompt.trim(), cwd);
      }

      setProgress(100);
      setCreationPhase('done');
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to create plan. Check that the Shipyard server is running.';
      toast.error(message);
      setCreationPhase('idle');
      setProgress(0);
    }
  };

  const handleCancel = () => {
    if (successTimeoutRef.current !== null) {
      clearTimeout(successTimeoutRef.current);
      successTimeoutRef.current = null;
    }
    setPrompt('');
    setCreationPhase('idle');
    setProgress(0);
    setPendingPlanId(null);
    setSuccessInfo(null);
    confettiTriggered.current = false;
    onClose();
  };

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
                      Importing conversation from {a2aConversation.meta.sourcePlatform}
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

                <TextField isRequired={!a2aConversation} isDisabled={isProcessing}>
                  <Label>
                    {a2aConversation ? 'Additional instructions (optional)' : 'Task prompt'}
                  </Label>
                  <TextArea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder={
                      a2aConversation
                        ? 'Add any additional instructions for the agent...'
                        : 'Describe what you want the agent to do...'
                    }
                    autoFocus
                    minLength={a2aConversation ? 0 : 5}
                    rows={4}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    {a2aConversation
                      ? 'Agent will continue the imported conversation.'
                      : 'Claude Code will work on this task autonomously.'}
                  </p>
                </TextField>

                {isProcessing && (
                  <ProgressBar progress={progress} stage={creationPhase.replace('-', ' ')} />
                )}

                {creationPhase === 'success' && successInfo && (
                  <div className="animate-in zoom-in-95 fade-in duration-300">
                    <Alert
                      status="success"
                      className="border-2 border-success/30 shadow-lg shadow-success/10"
                    >
                      <Alert.Indicator>
                        <CheckCircle2 className="w-5 h-5 text-success animate-in spin-in-180 duration-500" />
                      </Alert.Indicator>
                      <Alert.Content>
                        <Alert.Title className="text-lg font-semibold">Agent launched!</Alert.Title>
                        <Alert.Description className="text-muted-foreground">
                          Running with PID {successInfo.pid}
                        </Alert.Description>
                        <div className="mt-2">
                          <Link
                            href={`${window.location.origin}${getPlanRoute(successInfo.planId)}`}
                            target="_blank"
                            className="text-sm text-accent hover:text-accent/80 underline-offset-2 hover:underline"
                          >
                            Open plan
                            <Link.Icon className="ml-1 size-3">
                              <ExternalLink />
                            </Link.Icon>
                          </Link>
                        </div>
                      </Alert.Content>
                    </Alert>
                  </div>
                )}

                {!connected && (
                  <div className="px-3 py-2 rounded-lg bg-danger/10 border border-danger/20">
                    <p className="text-sm text-danger">
                      Daemon not connected. Please ensure the daemon is running.
                    </p>
                  </div>
                )}

                <div className="flex gap-2 justify-end pt-2">
                  {creationPhase === 'success' ? (
                    <Button variant="secondary" onPress={handleCancel} type="button">
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
                          creationPhase !== 'idle' ||
                          !connected ||
                          (!a2aConversation && !prompt.trim())
                        }
                        isPending={isProcessing}
                        variant="primary"
                      >
                        {a2aConversation ? 'Launch with Conversation' : 'Start Agent'}
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
