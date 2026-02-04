import { Button, Card, Label, Modal, TextArea, TextField } from '@heroui/react';
import { useRepo } from '@loro-extended/react';
import type { TaskId } from '@shipyard/loro-schema';
import confetti from 'canvas-confetti';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ProgressBar } from '@/components/ui/progress-bar';
import { useUserIdentity } from '@/contexts/user-identity-context';
import { useDaemon } from '@/hooks/use-daemon';
import { useGitHubAuth } from '@/hooks/use-github-auth';
import { useSpawnAgent } from '@/hooks/use-spawn-agent';
import { useSpawnStatus } from '@/hooks/use-spawn-status';
import { createTaskBrowserOnly } from '@/utils/create-task-browser-only';
import { DaemonWarning } from './daemon-warning';
import type { ConnectedPeer } from './p2p-peer-selector';
import { P2PPeerSelector } from './p2p-peer-selector';
import { SpawnStatusAlert, TaskCreatedAlert } from './success-alert';

export interface StartAgentModalProps {
  isOpen: boolean;
  onClose: () => void;
  cwd?: string;
  /** Connected peers that have daemon access (for P2P fallback) */
  peersWithDaemon?: ConnectedPeer[];
}

type CreationPhase =
  | 'idle'
  | 'creating-task'
  | 'spawning'
  | 'waiting-for-spawn'
  | 'spawn-started'
  | 'spawn-failed'
  | 'task-created-no-agent';

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
      colors: ['#10b981', '#34d399', '#6ee7b7', '#a7f3d0'],
      zIndex: 9999,
    });
    confetti({
      particleCount: 3,
      angle: 120,
      spread: 55,
      origin: { x: 1, y: 0.7 },
      colors: ['#10b981', '#34d399', '#6ee7b7', '#a7f3d0'],
      zIndex: 9999,
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
    colors: ['#10b981', '#34d399', '#6ee7b7', '#a7f3d0', '#fbbf24', '#f59e0b'],
    zIndex: 9999,
  });
}

export function StartAgentModal({
  isOpen,
  onClose,
  cwd = '/tmp',
  peersWithDaemon = [],
}: StartAgentModalProps) {
  const [prompt, setPrompt] = useState('');
  const [creationPhase, setCreationPhase] = useState<CreationPhase>('idle');
  const [progress, setProgress] = useState(0);
  const [successTaskId, setSuccessTaskId] = useState<TaskId | null>(null);
  const [selectedPeerId, setSelectedPeerId] = useState<string | null>(null);
  const [lastRequestId, setLastRequestId] = useState<string | null>(null);
  const { actor } = useUserIdentity();
  const { identity } = useGitHubAuth();
  const repo = useRepo();
  const { spawnAgent } = useSpawnAgent();
  const confettiTriggered = useRef(false);
  const toastShownRef = useRef<Set<string>>(new Set());

  const { isAvailable: daemonAvailable, isChecking: isCheckingDaemon, checkHealth } = useDaemon();

  // Track spawn status for the current request
  const spawnStatus = useSpawnStatus(successTaskId, lastRequestId);

  useEffect(() => {
    if (isOpen) {
      checkHealth();
    }
  }, [isOpen, checkHealth]);

  // Watch spawn status and update creation phase accordingly
  useEffect(() => {
    if (!lastRequestId || !successTaskId) return;
    if (creationPhase !== 'waiting-for-spawn') return;

    const toastKey = `${lastRequestId}-${spawnStatus.phase}`;
    const alreadyShown = toastShownRef.current.has(toastKey);

    switch (spawnStatus.phase) {
      case 'started':
        if (!alreadyShown) {
          toastShownRef.current.add(toastKey);
          toast.success('Agent started', {
            description: `Process ID: ${spawnStatus.pid}`,
          });
        }
        fireConfetti(confettiTriggered);
        setCreationPhase('spawn-started');
        break;

      case 'failed':
        if (!alreadyShown) {
          toastShownRef.current.add(toastKey);
          toast.error('Agent spawn failed', {
            description: spawnStatus.error,
          });
        }
        setCreationPhase('spawn-failed');
        break;
    }
  }, [
    spawnStatus.phase,
    spawnStatus.pid,
    spawnStatus.error,
    lastRequestId,
    successTaskId,
    creationPhase,
  ]);

  // Show toasts for completed events even after modal state changes
  useEffect(() => {
    if (!lastRequestId || !successTaskId) return;

    const toastKey = `${lastRequestId}-${spawnStatus.phase}`;
    if (toastShownRef.current.has(toastKey)) return;

    if (spawnStatus.phase === 'completed') {
      toastShownRef.current.add(toastKey);
      if (spawnStatus.exitCode === 0) {
        toast.success('Agent completed successfully');
      } else {
        toast.warning('Agent exited', {
          description: `Exit code: ${spawnStatus.exitCode}`,
        });
      }
    }
  }, [spawnStatus.phase, spawnStatus.exitCode, lastRequestId, successTaskId]);

  const canSpawnDirectly = daemonAvailable;
  const canSpawnViaPeer = !daemonAvailable && peersWithDaemon.length > 0 && selectedPeerId !== null;
  const canSpawn = canSpawnDirectly || canSpawnViaPeer;

  const isProcessing =
    creationPhase !== 'idle' &&
    creationPhase !== 'spawn-started' &&
    creationPhase !== 'spawn-failed' &&
    creationPhase !== 'task-created-no-agent';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!prompt.trim()) return;

    // Reset toast tracking for new submission
    toastShownRef.current = new Set();

    setCreationPhase('creating-task');
    setProgress(10);

    try {
      const title = prompt.slice(0, 100) || 'Agent Task';

      const { taskId } = await createTaskBrowserOnly({
        title,
        ownerId: identity?.username || actor || 'anonymous',
        repo,
      });

      setProgress(50);
      setSuccessTaskId(taskId);

      if (!canSpawn) {
        setProgress(100);
        setCreationPhase('task-created-no-agent');
        return;
      }

      setCreationPhase('spawning');
      setProgress(75);

      toast.info('Requesting agent spawn...');

      const result = spawnAgent({
        taskId,
        prompt: prompt.trim(),
        cwd,
        actor: actor || 'anonymous',
        targetMachineId: canSpawnDirectly ? undefined : selectedPeerId || undefined,
      });

      setLastRequestId(result.requestId);
      setProgress(100);
      setCreationPhase('waiting-for-spawn');
      // Stay in waiting state until spawn_started or spawn_failed event
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to create task. Please try again.';
      toast.error(message);
      setCreationPhase('idle');
      setProgress(0);
    }
  };

  const handleCancel = () => {
    setPrompt('');
    setCreationPhase('idle');
    setProgress(0);
    setSuccessTaskId(null);
    setSelectedPeerId(null);
    setLastRequestId(null);
    confettiTriggered.current = false;
    toastShownRef.current = new Set();
    onClose();
  };

  // Show spawn status alert during any spawn-related phase
  const showSpawnStatusAlert =
    creationPhase === 'waiting-for-spawn' ||
    creationPhase === 'spawn-started' ||
    creationPhase === 'spawn-failed';

  // Show task-created alert only when no agent was spawned
  const showTaskCreatedAlert = creationPhase === 'task-created-no-agent';

  // Modal can be closed when spawn succeeded, failed, or task was created without agent
  const canClose =
    creationPhase === 'spawn-started' ||
    creationPhase === 'spawn-failed' ||
    creationPhase === 'task-created-no-agent';

  const showPeerSelector =
    !daemonAvailable && peersWithDaemon.length > 0 && creationPhase === 'idle';

  const getButtonLabel = (): string => {
    if (isCheckingDaemon) return 'Checking...';
    if (canSpawnDirectly) return 'Start Agent';
    if (canSpawnViaPeer) return 'Start Agent via Peer';
    return 'Create Task';
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
                <TextField isRequired isDisabled={isProcessing}>
                  <Label>Task prompt</Label>
                  <TextArea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Describe what you want the agent to do..."
                    autoFocus
                    minLength={5}
                    rows={4}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Claude Code will work on this task autonomously.
                  </p>
                </TextField>

                {/* Show progress bar during initial creation phases */}
                {(creationPhase === 'creating-task' || creationPhase === 'spawning') && (
                  <ProgressBar progress={progress} stage={creationPhase.replace(/-/g, ' ')} />
                )}

                {/* Show spawn status alert with real-time updates */}
                {showSpawnStatusAlert && successTaskId && (
                  <SpawnStatusAlert taskId={successTaskId} requestId={lastRequestId} />
                )}

                {/* Show task-created alert when no agent was spawned */}
                {showTaskCreatedAlert && successTaskId && (
                  <TaskCreatedAlert taskId={successTaskId} />
                )}

                {/* Show retry hint on failure */}
                {creationPhase === 'spawn-failed' && (
                  <div className="text-sm text-muted-foreground">
                    You can close this modal and try again.
                  </div>
                )}

                {showPeerSelector && (
                  <P2PPeerSelector
                    peersWithDaemon={peersWithDaemon}
                    selectedPeerId={selectedPeerId}
                    onPeerSelect={setSelectedPeerId}
                    isDisabled={isProcessing}
                  />
                )}

                {!daemonAvailable && peersWithDaemon.length === 0 && creationPhase === 'idle' && (
                  <DaemonWarning />
                )}

                <div className="flex gap-2 justify-end pt-2">
                  {canClose ? (
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
                        isDisabled={creationPhase !== 'idle' || !prompt.trim() || isCheckingDaemon}
                        isPending={isProcessing}
                        variant="primary"
                      >
                        {getButtonLabel()}
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
