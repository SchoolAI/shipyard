import { Spinner } from '@heroui/react';
import { type TaskId, toTaskId } from '@shipyard/loro-schema';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { type AnyInputRequest, AnyInputRequestModal } from '@/components/any-input-request-modal';
import { AuthChoiceModal } from '@/components/auth-choice-modal';
import { GitHubAuthOverlay } from '@/components/github-auth-modal';
import { SignInModal } from '@/components/sign-in-modal';
import { TaskContent, type TaskViewTab } from '@/components/task/task-content';
import { TaskHeader } from '@/components/task/task-header';
import { WaitingRoomGate } from '@/components/waiting-room-gate';
import { useGitHubAuth } from '@/hooks/use-github-auth';
import { useIsMobile } from '@/hooks/use-is-mobile';
import { useLocalIdentity } from '@/hooks/use-local-identity';
import { useServerConnection } from '@/hooks/use-server-connection';
import { useSpawnToasts } from '@/hooks/use-spawn-toasts';
import { useTaskMeta } from '@/loro/selectors/task-selectors';
import { colorFromString } from '@/utils/color';
import { getTaskFromUrl } from '@/utils/snapshot-url';

function isValidTab(tab: string | null): tab is TaskViewTab {
  if (tab === null) return false;
  return tab === 'plan' || tab === 'activity' || tab === 'deliverables' || tab === 'changes';
}

interface UserIdentity {
  id: string;
  name: string;
  color: string;
}

interface TaskPageContentProps {
  taskId: TaskId;
  isSnapshot?: boolean;
}

function TaskPageContent({ taskId, isSnapshot = false }: TaskPageContentProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const isMobile = useIsMobile();
  const { identity: githubIdentity, startAuth, authState } = useGitHubAuth();
  const { localIdentity, setLocalIdentity } = useLocalIdentity();
  const isLocalViewing = useServerConnection();
  const meta = useTaskMeta(taskId);
  const [showAuthChoice, setShowAuthChoice] = useState(false);
  const [showLocalSignIn, setShowLocalSignIn] = useState(false);
  const [activeInputRequest, setActiveInputRequest] = useState<AnyInputRequest | null>(null);
  const [isInputModalOpen, setIsInputModalOpen] = useState(false);

  // Show toasts for spawn events (only new events after page load)
  useSpawnToasts({ taskId });

  // Listen for open-input-request events
  useEffect(() => {
    const handleOpenInputRequest = (event: Event) => {
      if (!(event instanceof CustomEvent)) return;
      const detail = event.detail as {
        request?: AnyInputRequest;
        taskId?: TaskId;
      };
      if (detail.request && detail.taskId === taskId) {
        setActiveInputRequest(detail.request);
        setIsInputModalOpen(true);
      }
    };

    document.addEventListener('open-input-request', handleOpenInputRequest);
    return () => {
      document.removeEventListener('open-input-request', handleOpenInputRequest);
    };
  }, [taskId]);

  const tabFromUrl = searchParams.get('tab');
  const initialTab: TaskViewTab = isValidTab(tabFromUrl) ? tabFromUrl : 'plan';

  const handleTabChange = useCallback(
    (tab: TaskViewTab) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (tab === 'plan') {
            next.delete('tab');
          } else {
            next.set('tab', tab);
          }
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const identity: UserIdentity | null = githubIdentity
    ? {
        id: githubIdentity.username,
        name: githubIdentity.displayName,
        color: colorFromString(githubIdentity.username),
      }
    : localIdentity
      ? {
          id: `local:${localIdentity.username}`,
          name: localIdentity.username,
          color: colorFromString(localIdentity.username),
        }
      : null;

  const handleRequestIdentity = useCallback(() => {
    setShowAuthChoice(true);
  }, []);

  const handleLocalSignIn = useCallback(
    (username: string) => {
      setLocalIdentity(username);
      setShowLocalSignIn(false);
    },
    [setLocalIdentity]
  );

  // Derive user ID for approval status check
  const userId = githubIdentity
    ? githubIdentity.username
    : localIdentity
      ? `local:${localIdentity.username}`
      : null;

  if (!meta.id) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Spinner size="lg" />
          <p className="text-muted-foreground">Loading task...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <WaitingRoomGate
        taskId={taskId}
        userId={userId}
        title={meta.title}
        onStartAuth={() => setShowAuthChoice(true)}
        isSnapshot={isSnapshot}
        isLocalViewing={isLocalViewing}
      >
        <div className="flex h-screen flex-col">
          <header className="shrink-0 border-b border-separator bg-surface px-2 py-1 md:px-6 md:py-2">
            <TaskHeader taskId={taskId} isMobile={isMobile} />
          </header>

          <div className="flex-1 overflow-hidden">
            <TaskContent
              taskId={taskId}
              identity={identity}
              onRequestIdentity={handleRequestIdentity}
              initialTab={initialTab}
              onTabChange={handleTabChange}
            />
          </div>
        </div>
      </WaitingRoomGate>

      <GitHubAuthOverlay authState={authState} />
      <AuthChoiceModal
        isOpen={showAuthChoice}
        onOpenChange={setShowAuthChoice}
        onGitHubAuth={startAuth}
        onLocalAuth={() => setShowLocalSignIn(true)}
      />
      <SignInModal
        isOpen={showLocalSignIn}
        onClose={() => setShowLocalSignIn(false)}
        onSignIn={handleLocalSignIn}
      />
      <AnyInputRequestModal
        isOpen={isInputModalOpen}
        request={activeInputRequest}
        taskId={taskId}
        onClose={() => {
          setIsInputModalOpen(false);
          setActiveInputRequest(null);
        }}
      />
    </>
  );
}

function SnapshotTaskPage() {
  const [searchParams] = useSearchParams();
  const encodedData = searchParams.get('d');

  const snapshotTask = useMemo(() => (encodedData ? getTaskFromUrl() : null), [encodedData]);

  if (!snapshotTask) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-xl font-bold text-foreground">Invalid Snapshot</h1>
          <p className="text-muted-foreground">The snapshot URL could not be decoded.</p>
        </div>
      </div>
    );
  }

  const taskId = toTaskId(snapshotTask.id);

  return <TaskPageContent taskId={taskId} isSnapshot />;
}

export function TaskPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const hasSnapshot = searchParams.has('d');

  if (hasSnapshot) {
    return <SnapshotTaskPage />;
  }

  if (!id) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-xl font-bold text-foreground">Task Not Found</h1>
          <p className="text-muted-foreground">No task ID provided.</p>
        </div>
      </div>
    );
  }

  const taskId = toTaskId(id);

  return <TaskPageContent taskId={taskId} />;
}
