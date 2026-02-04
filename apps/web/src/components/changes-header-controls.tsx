import {
  Button,
  ButtonGroup,
  Chip,
  Description,
  Dropdown,
  Header,
  Label,
  Separator,
} from '@heroui/react';
import {
  AlertCircle,
  Check,
  ChevronDown,
  CircleDot,
  Clock,
  ExternalLink,
  FolderGit2,
  GitBranch,
  GitPullRequest,
  KeyRound,
  Monitor,
  RefreshCw,
  Rocket,
} from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useGitHubAuth } from '@/hooks/use-github-auth';
import type {
  ChangeSnapshot,
  ChangesViewState,
  LinkedPR,
  MachinePickerState,
} from './changes-types';
import { MachineStatusIndicator } from './machine-status-indicator';

type PublishErrorType =
  | 'needs_repo_scope'
  | 'needs_write_access'
  | 'pr_not_found'
  | 'rate_limited'
  | 'network_error'
  | 'unknown';

interface PublishError {
  type: PublishErrorType;
  message: string;
}

interface ChangesHeaderControlsProps {
  state: ChangesViewState;
  repo?: string;
  isMobile?: boolean;
  onRefreshLocal?: () => void;
  onRefreshPR?: () => void;
}

function getEffectiveLocalData(state: ChangesViewState): {
  branch: string;
  fileCount: number;
  staged: number;
  unstaged: number;
} {
  const { machinePicker } = state;
  const { selectedMachineId, snapshots } = machinePicker;

  const snapshot = selectedMachineId ? snapshots[selectedMachineId] : Object.values(snapshots)[0];

  if (snapshot) {
    const stagedCount = snapshot.files.filter((f) => f.staged).length;
    return {
      branch: snapshot.branch,
      fileCount: snapshot.files.length,
      staged: stagedCount,
      unstaged: snapshot.files.length - stagedCount,
    };
  }

  return {
    branch: 'No branch',
    fileCount: 0,
    staged: 0,
    unstaged: 0,
  };
}

function classifyPublishErrorByStatus(
  status: number,
  responseBody: { message?: string; documentation_url?: string },
  hasRepoScope: boolean
): PublishError {
  if (status === 403 && responseBody.message?.toLowerCase().includes('rate limit')) {
    return {
      type: 'rate_limited',
      message: 'GitHub API rate limit exceeded. Please wait a few minutes and try again.',
    };
  }

  if (status === 403) {
    return {
      type: 'needs_write_access',
      message:
        "You don't have write access to this repository. Ask a maintainer to grant you triage role or higher.",
    };
  }

  if (status === 401) {
    return {
      type: 'needs_repo_scope',
      message: 'Your GitHub session has expired. Please sign in again.',
    };
  }

  if (status === 404 && !hasRepoScope) {
    return {
      type: 'needs_repo_scope',
      message:
        "Can't access this PR. You may need to grant private repo access to view and publish PRs in private repositories.",
    };
  }

  if (status === 404) {
    return {
      type: 'needs_write_access',
      message:
        "Can't publish this PR. You may not have write access to this repository, or the PR may have been deleted.",
    };
  }

  return {
    type: 'unknown',
    message: responseBody.message || `GitHub API error (HTTP ${status})`,
  };
}

interface UsePublishPRResult {
  isPublishing: boolean;
  publishError: PublishError | null;
  handlePublish: () => Promise<void>;
  handleRequestRepoAccess: () => void;
  handleSignIn: () => void;
  clearError: () => void;
}

function usePublishPR(selectedPR: LinkedPR | null, repo: string | undefined): UsePublishPRResult {
  const { identity, hasRepoScope, startAuth, requestRepoAccess } = useGitHubAuth();
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishError, setPublishError] = useState<PublishError | null>(null);

  const classifyPublishError = useCallback(
    (
      status: number,
      responseBody: { message?: string; documentation_url?: string }
    ): PublishError => classifyPublishErrorByStatus(status, responseBody, hasRepoScope),
    [hasRepoScope]
  );

  const handlePublish = useCallback(async () => {
    if (!selectedPR || !repo) return;

    setPublishError(null);

    if (!identity?.token) {
      toast.info('Sign in with GitHub to publish this PR');
      startAuth();
      return;
    }

    setIsPublishing(true);

    try {
      const response = await fetch(
        `https://api.github.com/repos/${repo}/pulls/${selectedPR.prNumber}`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${identity.token}`,
            Accept: 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ draft: false }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const classifiedError = classifyPublishError(response.status, errorData);
        setPublishError(classifiedError);

        if (classifiedError.type === 'rate_limited' || classifiedError.type === 'unknown') {
          toast.error(classifiedError.message);
        }
        return;
      }

      toast.success('PR published successfully');
    } catch (_err) {
      setPublishError({
        type: 'network_error',
        message: 'Could not connect to GitHub. Check your internet connection.',
      });
      toast.error('Network error. Please check your connection.');
    } finally {
      setIsPublishing(false);
    }
  }, [selectedPR, repo, identity?.token, startAuth, classifyPublishError]);

  const handleRequestRepoAccess = useCallback(() => {
    setPublishError(null);
    requestRepoAccess();
  }, [requestRepoAccess]);

  const handleSignIn = useCallback(() => {
    setPublishError(null);
    startAuth();
  }, [startAuth]);

  const clearError = useCallback(() => {
    setPublishError(null);
  }, []);

  return {
    isPublishing,
    publishError,
    handlePublish,
    handleRequestRepoAccess,
    handleSignIn,
    clearError,
  };
}

interface MobileHeaderControlsProps {
  source: 'local' | 'pr';
  setSource: (source: 'local' | 'pr') => void;
  selectedPR: LinkedPR | null;
  hasPRs: boolean;
  machinePicker: MachinePickerState;
  effectiveData: EffectiveLocalData;
  handleAction: (key: React.Key) => void;
  repo?: string;
  isPublishing: boolean;
  publishError: PublishError | null;
  handleRefresh: () => void;
  refreshLabel: string;
}

function MobileHeaderControls({
  source,
  setSource,
  selectedPR,
  hasPRs,
  machinePicker,
  effectiveData,
  handleAction,
  repo,
  isPublishing,
  publishError,
  handleRefresh,
  refreshLabel,
}: MobileHeaderControlsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {hasPRs && selectedPR && (
        <SourceToggleButtons source={source} setSource={setSource} showPRNumber={false} />
      )}

      {source === 'local' && machinePicker.shouldShow && (
        <MachineDropdown machinePicker={machinePicker} isMobile />
      )}

      <InfoDropdownTrigger
        source={source}
        effectiveData={effectiveData}
        selectedPR={selectedPR}
        handleAction={handleAction}
        repo={repo}
        isPublishing={isPublishing}
        publishError={publishError}
        isMobile
      />

      <Button
        size="sm"
        variant="secondary"
        isIconOnly
        onPress={handleRefresh}
        aria-label={refreshLabel}
      >
        <RefreshCw className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}

interface SourceToggleButtonsProps {
  source: 'local' | 'pr';
  setSource: (source: 'local' | 'pr') => void;
  showPRNumber?: boolean;
  prNumber?: number;
}

function SourceToggleButtons({
  source,
  setSource,
  showPRNumber = true,
  prNumber,
}: SourceToggleButtonsProps) {
  return (
    <ButtonGroup size="sm" variant="ghost" hideSeparator>
      <Button
        onPress={() => setSource('local')}
        variant={source === 'local' ? 'secondary' : 'ghost'}
        className={source === 'local' ? 'font-medium' : 'text-muted opacity-70'}
      >
        <FolderGit2 className="w-3.5 h-3.5" />
        Local
      </Button>
      <Button
        onPress={() => setSource('pr')}
        variant={source === 'pr' ? 'secondary' : 'ghost'}
        className={source === 'pr' ? 'font-medium' : 'text-muted opacity-70'}
      >
        <GitPullRequest className="w-3.5 h-3.5" />
        PR{showPRNumber && prNumber ? ` #${prNumber}` : ''}
      </Button>
    </ButtonGroup>
  );
}

interface InfoDropdownTriggerProps {
  source: 'local' | 'pr';
  effectiveData: EffectiveLocalData;
  selectedPR: LinkedPR | null;
  handleAction: (key: React.Key) => void;
  repo?: string;
  isPublishing: boolean;
  publishError: PublishError | null;
  isMobile?: boolean;
}

function InfoDropdownTrigger({
  source,
  effectiveData,
  selectedPR,
  handleAction,
  repo,
  isPublishing,
  publishError,
  isMobile = false,
}: InfoDropdownTriggerProps) {
  const maxWidth = isMobile ? 'max-w-[80px]' : 'max-w-[120px]';
  const titleMaxWidth = isMobile ? 'max-w-[80px]' : 'max-w-[150px]';

  return (
    <Dropdown>
      <Button size="sm" variant="secondary" className="gap-1">
        {source === 'local' ? (
          <span className="flex items-center gap-1.5">
            <GitBranch className="w-3.5 h-3.5" />
            <span className={`font-mono text-xs ${maxWidth} truncate`}>{effectiveData.branch}</span>
          </span>
        ) : (
          <span className="flex items-center gap-1.5">
            <GitPullRequest className="w-3.5 h-3.5" />
            <span className={`${titleMaxWidth} truncate`}>
              {isMobile ? `#${selectedPR?.prNumber}` : (selectedPR?.title ?? 'PR Info')}
            </span>
          </span>
        )}
        <ChevronDown className="w-3 h-3" />
      </Button>

      <Dropdown.Popover className="min-w-[280px]">
        <Dropdown.Menu onAction={handleAction}>
          {source === 'local' ? (
            <LocalInfoDropdown effectiveData={effectiveData} />
          ) : (
            <PRInfoDropdown
              selectedPR={selectedPR}
              repo={repo}
              isPublishing={isPublishing}
              publishError={publishError}
            />
          )}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}

export function ChangesHeaderControls({
  state,
  repo,
  isMobile = false,
  onRefreshLocal,
  onRefreshPR,
}: ChangesHeaderControlsProps) {
  const { source, setSource, selectedPR, hasPRs, machinePicker } = state;
  const { isPublishing, publishError, handlePublish, handleRequestRepoAccess, handleSignIn } =
    usePublishPR(selectedPR, repo);

  const handleAction = useCallback(
    (key: React.Key) => {
      if (key === 'publish') {
        handlePublish();
      } else if (key === 'github-link' && selectedPR) {
        const url = `https://github.com/${repo}/pull/${selectedPR.prNumber}`;
        window.open(url, '_blank', 'noopener,noreferrer');
      } else if (key === 'grant-repo-access') {
        handleRequestRepoAccess();
      } else if (key === 'sign-in-again') {
        handleSignIn();
      }
    },
    [handlePublish, selectedPR, repo, handleRequestRepoAccess, handleSignIn]
  );

  const effectiveData = useMemo(() => getEffectiveLocalData(state), [state]);

  const handleRefresh = useCallback(() => {
    if (source === 'local') {
      onRefreshLocal?.();
    } else {
      onRefreshPR?.();
    }
  }, [source, onRefreshLocal, onRefreshPR]);

  const refreshLabel = source === 'local' ? 'Refresh local changes' : 'Refresh PR files';

  if (isMobile) {
    return (
      <MobileHeaderControls
        source={source}
        setSource={setSource}
        selectedPR={selectedPR}
        hasPRs={hasPRs}
        machinePicker={machinePicker}
        effectiveData={effectiveData}
        handleAction={handleAction}
        repo={repo}
        isPublishing={isPublishing}
        publishError={publishError}
        handleRefresh={handleRefresh}
        refreshLabel={refreshLabel}
      />
    );
  }

  return (
    <DesktopHeaderControls
      source={source}
      setSource={setSource}
      selectedPR={selectedPR}
      hasPRs={hasPRs}
      machinePicker={machinePicker}
      effectiveData={effectiveData}
      handleAction={handleAction}
      repo={repo}
      isPublishing={isPublishing}
      publishError={publishError}
      handleRefresh={handleRefresh}
      refreshLabel={refreshLabel}
    />
  );
}

interface DesktopHeaderControlsProps {
  source: 'local' | 'pr';
  setSource: (source: 'local' | 'pr') => void;
  selectedPR: LinkedPR | null;
  hasPRs: boolean;
  machinePicker: MachinePickerState;
  effectiveData: EffectiveLocalData;
  handleAction: (key: React.Key) => void;
  repo?: string;
  isPublishing: boolean;
  publishError: PublishError | null;
  handleRefresh: () => void;
  refreshLabel: string;
}

function DesktopHeaderControls({
  source,
  setSource,
  selectedPR,
  hasPRs,
  machinePicker,
  effectiveData,
  handleAction,
  repo,
  isPublishing,
  publishError,
  handleRefresh,
  refreshLabel,
}: DesktopHeaderControlsProps) {
  return (
    <div className="flex items-center gap-2 pb-1.5 md:pb-2">
      {hasPRs && selectedPR && (
        <SourceToggleButtons
          source={source}
          setSource={setSource}
          showPRNumber
          prNumber={selectedPR.prNumber}
        />
      )}

      {source === 'local' && machinePicker.shouldShow && (
        <MachineDropdown machinePicker={machinePicker} />
      )}

      <InfoDropdownTrigger
        source={source}
        effectiveData={effectiveData}
        selectedPR={selectedPR}
        handleAction={handleAction}
        repo={repo}
        isPublishing={isPublishing}
        publishError={publishError}
      />

      <Button
        size="sm"
        variant="secondary"
        isIconOnly
        onPress={handleRefresh}
        aria-label={refreshLabel}
      >
        <RefreshCw className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}

interface EffectiveLocalData {
  branch: string;
  fileCount: number;
  staged: number;
  unstaged: number;
}

interface LocalInfoDropdownProps {
  effectiveData: EffectiveLocalData;
}

function LocalInfoDropdown({ effectiveData }: LocalInfoDropdownProps) {
  const { branch, fileCount, staged, unstaged } = effectiveData;

  return (
    <Dropdown.Section>
      <Header>Branch Info</Header>

      <Dropdown.Item id="branch-info" textValue="Branch info" className="pointer-events-none">
        <GitBranch className="w-4 h-4 shrink-0 text-muted-foreground" />
        <Label className="font-mono text-sm text-foreground">{branch}</Label>
      </Dropdown.Item>

      {fileCount > 0 && (
        <Dropdown.Item id="file-stats" textValue="File stats" className="pointer-events-none">
          <div className="flex flex-col gap-1.5 py-1">
            <span className="text-sm font-medium text-foreground">
              {fileCount} file{fileCount !== 1 ? 's' : ''} changed
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              {staged > 0 && (
                <Chip size="sm" color="success" className="flex items-center gap-0.5">
                  <Check className="w-3 h-3" />
                  {staged} staged
                </Chip>
              )}
              {unstaged > 0 && (
                <Chip size="sm" color="warning" className="flex items-center gap-0.5">
                  <CircleDot className="w-3 h-3" />
                  {unstaged} unstaged
                </Chip>
              )}
            </div>
          </div>
        </Dropdown.Item>
      )}
    </Dropdown.Section>
  );
}

interface PRInfoDropdownProps {
  selectedPR: LinkedPR | null;
  repo?: string;
  isPublishing: boolean;
  publishError: PublishError | null;
}

function PRInfoDropdown({ selectedPR, repo, isPublishing, publishError }: PRInfoDropdownProps) {
  if (!selectedPR) {
    return (
      <Dropdown.Item id="no-pr" textValue="No PR selected" className="pointer-events-none">
        <Label className="text-muted-foreground">No PR selected</Label>
      </Dropdown.Item>
    );
  }

  const showPublishButton = selectedPR.status === 'draft' && repo;

  return (
    <>
      <Dropdown.Section>
        <Header>PR Info</Header>

        <Dropdown.Item
          id="pr-info"
          textValue={`PR #${selectedPR.prNumber}`}
          className="pointer-events-none"
        >
          <div className="flex flex-col gap-1.5 py-1">
            <div className="flex items-center gap-2">
              <GitPullRequest className="w-4 h-4 shrink-0 text-muted-foreground" />
              <span className="font-medium text-foreground">#{selectedPR.prNumber}</span>
              <PRStatusChip status={selectedPR.status} />
            </div>
            {selectedPR.title && (
              <Description className="text-xs text-muted-foreground line-clamp-2">
                {selectedPR.title}
              </Description>
            )}
          </div>
        </Dropdown.Item>

        {selectedPR.branch && (
          <Dropdown.Item
            id="pr-branch"
            textValue={selectedPR.branch}
            className="pointer-events-none"
          >
            <GitBranch className="w-4 h-4 shrink-0 text-muted-foreground" />
            <Label className="font-mono text-xs text-foreground">{selectedPR.branch}</Label>
          </Dropdown.Item>
        )}
      </Dropdown.Section>

      {publishError && (
        <>
          <Separator />
          <Dropdown.Section>
            <Dropdown.Item
              id="publish-error"
              textValue="Publish error"
              className="pointer-events-none"
            >
              <div className="flex flex-col gap-2 py-2 w-full">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-danger mt-0.5" />
                  <span className="text-sm text-danger">{publishError.message}</span>
                </div>
              </div>
            </Dropdown.Item>

            {publishError.type === 'needs_repo_scope' && (
              <Dropdown.Item id="grant-repo-access" textValue="Grant private repo access">
                <KeyRound className="w-4 h-4 shrink-0 text-accent" />
                <Label className="text-accent">Grant private repo access</Label>
              </Dropdown.Item>
            )}

            {publishError.type === 'needs_write_access' && (
              <Dropdown.Item id="github-link" textValue="Check access on GitHub">
                <ExternalLink className="w-4 h-4 shrink-0 text-accent" />
                <Label className="text-accent">Check access on GitHub</Label>
              </Dropdown.Item>
            )}

            {(publishError.type === 'network_error' || publishError.type === 'rate_limited') && (
              <Dropdown.Item id="publish" textValue="Try again">
                <RefreshCw className="w-4 h-4 shrink-0 text-accent" />
                <Label className="text-accent">Try again</Label>
              </Dropdown.Item>
            )}
          </Dropdown.Section>
        </>
      )}

      {(showPublishButton || repo) && (
        <>
          <Separator />
          <Dropdown.Section>
            <Header>Actions</Header>
            {showPublishButton && (
              <Dropdown.Item id="publish" textValue="Publish PR" isDisabled={isPublishing}>
                <Rocket
                  className={`w-4 h-4 shrink-0 ${isPublishing ? 'text-muted' : 'text-success'}`}
                />
                <Label>{isPublishing ? 'Publishing...' : 'Publish PR'}</Label>
              </Dropdown.Item>
            )}

            {repo && (
              <Dropdown.Item id="github-link" textValue="View on GitHub">
                <ExternalLink className="w-4 h-4 shrink-0 text-muted-foreground" />
                <Label>View on GitHub</Label>
              </Dropdown.Item>
            )}
          </Dropdown.Section>
        </>
      )}
    </>
  );
}

function PRStatusChip({ status }: { status: LinkedPR['status'] }) {
  const color =
    status === 'draft'
      ? 'default'
      : status === 'merged'
        ? 'accent'
        : status === 'open'
          ? 'success'
          : 'danger';

  return (
    <Chip size="sm" color={color}>
      {status}
    </Chip>
  );
}

interface MachineDropdownProps {
  machinePicker: MachinePickerState;
  isMobile?: boolean;
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) {
    return 'just now';
  }
  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }
  if (diffDays < 30) {
    return `${diffDays}d ago`;
  }

  return new Date(timestamp).toLocaleDateString();
}

function MachineDropdown({ machinePicker, isMobile = false }: MachineDropdownProps) {
  const { snapshots, localMachineId, selectedMachineId, onSelectMachine } = machinePicker;

  const sortedSnapshots = useMemo(() => {
    return Object.entries(snapshots).sort(([idA, a], [idB, b]) => {
      if (idA === localMachineId) return -1;
      if (idB === localMachineId) return 1;
      if (a.isLive !== b.isLive) return a.isLive ? -1 : 1;
      return b.updatedAt - a.updatedAt;
    });
  }, [snapshots, localMachineId]);

  const selectedSnapshot = selectedMachineId
    ? snapshots[selectedMachineId]
    : sortedSnapshots[0]?.[1];

  const displayName = selectedSnapshot?.machineName ?? 'Select machine';
  const isLocal =
    selectedMachineId === localMachineId ||
    (!selectedMachineId && sortedSnapshots[0]?.[0] === localMachineId);

  const handleAction = useCallback(
    (key: React.Key) => {
      const machineId = String(key);
      if (machineId === localMachineId) {
        onSelectMachine(null);
      } else {
        onSelectMachine(machineId);
      }
    },
    [localMachineId, onSelectMachine]
  );

  if (isMobile) {
    return (
      <Dropdown>
        <Button size="sm" variant="secondary" className="gap-1">
          <Monitor className="w-3.5 h-3.5" />
          <span className="max-w-[60px] truncate text-xs">{displayName}</span>
          {isLocal && (
            <Chip size="sm" color="accent" variant="soft" className="h-4 text-[10px] px-1">
              You
            </Chip>
          )}
          <ChevronDown className="w-3 h-3" />
        </Button>

        <Dropdown.Popover className="min-w-[280px]">
          <Dropdown.Menu onAction={handleAction}>
            <Dropdown.Section>
              <Header>Machines</Header>
              {sortedSnapshots.map(([machineId, snapshot]) => (
                <MachineDropdownItem
                  key={machineId}
                  machineId={machineId}
                  snapshot={snapshot}
                  isLocalMachine={machineId === localMachineId}
                  isSelected={
                    machineId === selectedMachineId ||
                    (!selectedMachineId && machineId === localMachineId)
                  }
                />
              ))}
            </Dropdown.Section>
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown>
    );
  }

  return (
    <Dropdown>
      <Button size="sm" variant="secondary" className="gap-1">
        <span className="flex items-center gap-1.5">
          <Monitor className="w-3.5 h-3.5" />
          <span className="max-w-[140px] truncate">{displayName}</span>
          {isLocal && (
            <Chip size="sm" color="accent" variant="soft" className="h-4 text-[10px]">
              You
            </Chip>
          )}
        </span>
        <ChevronDown className="w-3 h-3" />
      </Button>

      <Dropdown.Popover className="min-w-[320px]">
        <Dropdown.Menu onAction={handleAction}>
          <Dropdown.Section>
            <Header>Machines</Header>
            {sortedSnapshots.map(([machineId, snapshot]) => (
              <MachineDropdownItem
                key={machineId}
                machineId={machineId}
                snapshot={snapshot}
                isLocalMachine={machineId === localMachineId}
                isSelected={
                  machineId === selectedMachineId ||
                  (!selectedMachineId && machineId === localMachineId)
                }
              />
            ))}
          </Dropdown.Section>
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}

interface MachineDropdownItemProps {
  machineId: string;
  snapshot: ChangeSnapshot;
  isLocalMachine: boolean;
  isSelected: boolean;
}

function MachineDropdownItem({
  machineId,
  snapshot,
  isLocalMachine,
  isSelected,
}: MachineDropdownItemProps) {
  return (
    <Dropdown.Item
      id={machineId}
      textValue={snapshot.machineName}
      className={isSelected ? 'bg-primary/10' : ''}
    >
      <div className="flex flex-col gap-1.5 py-1 w-full">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Monitor className="w-4 h-4 shrink-0 text-muted-foreground" />
            <span className="font-medium truncate">{snapshot.machineName}</span>
            {isLocalMachine && (
              <Chip size="sm" color="accent" variant="soft" className="h-4 text-[10px]">
                You
              </Chip>
            )}
          </div>
          <MachineStatusIndicator snapshot={snapshot} />
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span>
              {snapshot.files.length} file
              {snapshot.files.length !== 1 ? 's' : ''}
            </span>
            <span className="text-success">+{snapshot.totalAdditions}</span>
            <span className="text-danger">-{snapshot.totalDeletions}</span>
          </div>
          <div className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatRelativeTime(snapshot.updatedAt)}
          </div>
        </div>
      </div>
    </Dropdown.Item>
  );
}
