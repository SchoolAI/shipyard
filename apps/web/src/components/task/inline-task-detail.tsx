import { Spinner } from '@heroui/react';
import { type TaskId, type TaskStatus, toTaskId } from '@shipyard/loro-schema';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthChoiceModal } from '@/components/auth-choice-modal';
import { GitHubAuthOverlay } from '@/components/github-auth-modal';
import { PanelControlButtons } from '@/components/panel-control-buttons';
import { SignInModal } from '@/components/sign-in-modal';
import { TaskContent, type TaskViewTab } from '@/components/task/task-content';
import { TaskHeader } from '@/components/task/task-header';
import type { PanelWidth } from '@/components/task/task-panel';
import { getTaskRoute } from '@/constants/routes';
import { useGitHubAuth } from '@/hooks/use-github-auth';
import { useLocalIdentity } from '@/hooks/use-local-identity';
import { useTaskMeta } from '@/loro/selectors/task-selectors';
import { colorFromString } from '@/utils/color';

interface UserIdentity {
  id: string;
  name: string;
  color: string;
}

export interface TaskActionContext {
  taskId: TaskId;
}

export interface InlineTaskDetailProps {
  taskId: string | null;
  initialTab?: TaskViewTab;
  onClose: () => void;
  onApprove?: (context: TaskActionContext) => void;
  onRequestChanges?: (context: TaskActionContext) => void;
  onExpand?: () => void;
  /** Called when full screen button is pressed. If not provided, navigates to /task/:id */
  onFullScreen?: () => void;
  width?: PanelWidth;
  emptyMessage?: string;
  onStatusChange?: (newStatus: TaskStatus, updatedAt: number) => void;
}

function InlineTaskDetailContent({
  taskId,
  initialTab,
  width = 'peek',
  identity,
  onRequestIdentity,
  onClose,
  onExpand,
  onFullScreen,
}: {
  taskId: TaskId;
  initialTab?: TaskViewTab;
  width?: PanelWidth;
  identity: UserIdentity | null;
  onRequestIdentity: () => void;
  onClose: () => void;
  onExpand?: () => void;
  onFullScreen: () => void;
}) {
  const meta = useTaskMeta(taskId);

  if (!meta.id) {
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
    <div className="flex flex-col h-full">
      <header className="shrink-0 border-b border-separator bg-surface px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <TaskHeader taskId={taskId} isMobile={width === 'peek'} />
          </div>
          <PanelControlButtons
            width={width}
            onClose={onClose}
            onExpand={onExpand}
            onFullScreen={onFullScreen}
          />
        </div>
      </header>
      <div className="flex-1 overflow-y-auto">
        <TaskContent
          taskId={taskId}
          identity={identity}
          onRequestIdentity={onRequestIdentity}
          initialTab={initialTab}
        />
      </div>
    </div>
  );
}

export function InlineTaskDetail({
  taskId: taskIdProp,
  initialTab,
  onClose,
  onApprove: _onApprove,
  onRequestChanges: _onRequestChanges,
  onExpand,
  onFullScreen: onFullScreenProp,
  width = 'peek',
  emptyMessage = 'Select a task to view details',
  onStatusChange: _onStatusChange,
}: InlineTaskDetailProps) {
  const navigate = useNavigate();
  const { identity: githubIdentity, startAuth, authState } = useGitHubAuth();
  const { localIdentity, setLocalIdentity } = useLocalIdentity();
  const [showAuthChoice, setShowAuthChoice] = useState(false);
  const [showLocalSignIn, setShowLocalSignIn] = useState(false);
  const [loadTimeout, setLoadTimeout] = useState(false);

  const taskId = taskIdProp ? toTaskId(taskIdProp) : null;

  // Default full screen handler navigates to full task page
  const handleFullScreen = useCallback(() => {
    if (onFullScreenProp) {
      onFullScreenProp();
    } else if (taskId) {
      navigate(getTaskRoute(taskId));
    }
  }, [onFullScreenProp, taskId, navigate]);

  useEffect(() => {
    if (!taskId) {
      setLoadTimeout(false);
      return;
    }

    const timer = setTimeout(() => {
      setLoadTimeout(true);
    }, 10000);

    return () => clearTimeout(timer);
  }, [taskId]);

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

  const authModals = (
    <>
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
    </>
  );

  if (taskId) {
    return (
      <>
        <InlineTaskDetailContent
          taskId={taskId}
          initialTab={initialTab}
          width={width}
          identity={identity}
          onRequestIdentity={handleRequestIdentity}
          onClose={onClose}
          onExpand={onExpand}
          onFullScreen={handleFullScreen}
        />
        {authModals}
      </>
    );
  }

  if (loadTimeout) {
    return (
      <>
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <p className="text-danger mb-2">Task not found</p>
            <p className="text-sm text-muted-foreground">
              This task may have been deleted or is invalid.
            </p>
          </div>
        </div>
        {authModals}
      </>
    );
  }

  return (
    <>
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <p>{emptyMessage}</p>
      </div>
      {authModals}
    </>
  );
}
