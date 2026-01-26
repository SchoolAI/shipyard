/**
 * Header controls for the Changes tab.
 * Renders separate elements in the tab bar header area:
 * 1. Source Toggle - Pill buttons for "Local Changes" vs "PR #X"
 * 2. Machine Dropdown - Select which machine's changes to view (when in local mode)
 * 3. Info Dropdown - Contextual info only (branch details OR PR details)
 * 4. Refresh Button - Standalone button for both local and PR views
 */
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
import { type ChangeSnapshot, type LinkedPR, updateLinkedPRStatus } from '@shipyard/schema';
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
  Plus,
  RefreshCw,
  Rocket,
} from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import type * as Y from 'yjs';
import { useGitHubAuth } from '@/hooks/useGitHubAuth';
import { formatRelativeTime } from '@/utils/formatters';
import type { ChangesViewState, MachinePickerState } from './ChangesView';

/**
 * Publish error types for better error handling.
 * GitHub returns 404 for both "not found" and "no permission" cases,
 * so we need to infer the cause based on auth state.
 */
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
  ydoc: Y.Doc;
  /** Render mobile-optimized layout */
  isMobile?: boolean;
}

/**
 * Derive effective branch and file stats based on selected machine.
 * When viewing a remote machine's snapshot, use that data instead of local.
 */
function getEffectiveLocalData(state: ChangesViewState): {
  branch: string;
  fileCount: number;
  staged: number;
  unstaged: number;
  untracked: number;
} {
  const { machinePicker, localChanges } = state;
  const { selectedMachineId, localMachineId, snapshots } = machinePicker;

  /** If viewing a remote machine, use snapshot data */
  const isViewingRemote = selectedMachineId !== null && selectedMachineId !== localMachineId;
  if (isViewingRemote) {
    const snapshot = snapshots.get(selectedMachineId);
    if (snapshot) {
      const stagedCount = snapshot.files.filter((f) => f.staged).length;
      return {
        branch: snapshot.branch,
        fileCount: snapshot.files.length,
        staged: stagedCount,
        unstaged: snapshot.files.length - stagedCount,
        untracked: 0,
      };
    }
  }

  /** Default to local data */
  const data = localChanges.data;
  if (data?.available) {
    return {
      branch: data.branch,
      fileCount: data.files.length,
      staged: data.staged.length,
      unstaged: data.unstaged.length,
      untracked: data.untracked.length,
    };
  }

  return {
    branch: 'No branch',
    fileCount: 0,
    staged: 0,
    unstaged: 0,
    untracked: 0,
  };
}

/**
 * Header controls for the Changes tab.
 * Returns controls: Source Toggle, Machine Dropdown (local only), Info Dropdown, and Refresh Button.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Component has separate mobile and desktop layouts, complexity is inherent
export function ChangesHeaderControls({
  state,
  repo,
  ydoc,
  isMobile = false,
}: ChangesHeaderControlsProps) {
  const { source, setSource, selectedPR, hasPRs, localChanges, prChanges, machinePicker } = state;
  const { identity, hasRepoScope, startAuth, requestRepoAccess } = useGitHubAuth();
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishError, setPublishError] = useState<PublishError | null>(null);

  /**
   * Classify the error based on HTTP status and auth state.
   * GitHub returns 404 for permission issues, not 403.
   */
  const classifyPublishError = useCallback(
    (
      status: number,
      responseBody: { message?: string; documentation_url?: string }
    ): PublishError => {
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

      /**
       * 404 is ambiguous: GitHub returns it for both "not found" and "no permission"
       * to protect privacy of private resources.
       */
      if (status === 404) {
        if (!hasRepoScope) {
          return {
            type: 'needs_repo_scope',
            message:
              "Can't access this PR. You may need to grant private repo access to view and publish PRs in private repositories.",
          };
        }

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
    },
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

      updateLinkedPRStatus(ydoc, selectedPR.prNumber, 'open');
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
  }, [selectedPR, repo, ydoc, identity?.token, startAuth, classifyPublishError]);

  const handleRequestRepoAccess = useCallback(() => {
    setPublishError(null);
    requestRepoAccess();
  }, [requestRepoAccess]);

  const handleSignIn = useCallback(() => {
    setPublishError(null);
    startAuth();
  }, [startAuth]);

  const handleAction = useCallback(
    (key: React.Key) => {
      if (key === 'publish') {
        handlePublish();
      } else if (key === 'github-link' && selectedPR?.url) {
        window.open(selectedPR.url, '_blank', 'noopener,noreferrer');
      } else if (key === 'grant-repo-access') {
        handleRequestRepoAccess();
      } else if (key === 'sign-in-again') {
        handleSignIn();
      }
    },
    [handlePublish, selectedPR?.url, handleRequestRepoAccess, handleSignIn]
  );

  /** Get effective data based on selected machine (local or remote snapshot) */
  const effectiveData = useMemo(() => getEffectiveLocalData(state), [state]);

  /** Mobile layout: wrap controls and use full width */
  if (isMobile) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        {/* Source toggle (Local/PR) */}
        {hasPRs && selectedPR && (
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
              PR
            </Button>
          </ButtonGroup>
        )}

        {/* Machine dropdown - simplified for mobile */}
        {source === 'local' && machinePicker.shouldShow && (
          <MachineDropdown machinePicker={machinePicker} isMobile />
        )}

        {/* Branch/PR info dropdown */}
        <Dropdown>
          <Button size="sm" variant="secondary" className="gap-1">
            {source === 'local' ? (
              <span className="flex items-center gap-1.5">
                <GitBranch className="w-3.5 h-3.5" />
                <span className="font-mono text-xs max-w-[80px] truncate">
                  {effectiveData.branch}
                </span>
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                <GitPullRequest className="w-3.5 h-3.5" />
                <span className="max-w-[80px] truncate">#{selectedPR?.prNumber}</span>
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

        {/* Refresh button */}
        <Button
          size="sm"
          variant="secondary"
          isIconOnly
          onPress={() => {
            if (source === 'local') {
              localChanges.refetch();
            } else {
              prChanges.refetch();
            }
          }}
          aria-label={source === 'local' ? 'Refresh local changes' : 'Refresh PR files'}
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${
              (source === 'local' ? localChanges.isFetching : prChanges.isFetching)
                ? 'animate-spin'
                : ''
            }`}
          />
        </Button>
      </div>
    );
  }

  /** Desktop layout: horizontal row */
  return (
    <div className="flex items-center gap-2 pb-1.5 md:pb-2">
      {hasPRs && selectedPR && (
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
            PR #{selectedPR.prNumber}
          </Button>
        </ButtonGroup>
      )}

      {/* Machine dropdown - only show when viewing local changes and multiple machines available */}
      {source === 'local' && machinePicker.shouldShow && (
        <MachineDropdown machinePicker={machinePicker} />
      )}

      <Dropdown>
        <Button size="sm" variant="secondary" className="gap-1">
          {source === 'local' ? (
            <span className="flex items-center gap-1.5">
              <GitBranch className="w-3.5 h-3.5" />
              <span className="font-mono text-xs max-w-[120px] truncate">
                {effectiveData.branch}
              </span>
            </span>
          ) : (
            <span className="flex items-center gap-1.5">
              <GitPullRequest className="w-3.5 h-3.5" />
              <span className="max-w-[150px] truncate">{selectedPR?.title ?? 'PR Info'}</span>
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

      <Button
        size="sm"
        variant="secondary"
        isIconOnly
        onPress={() => {
          if (source === 'local') {
            localChanges.refetch();
          } else {
            prChanges.refetch();
          }
        }}
        aria-label={source === 'local' ? 'Refresh local changes' : 'Refresh PR files'}
      >
        <RefreshCw
          className={`w-3.5 h-3.5 ${
            (source === 'local' ? localChanges.isFetching : prChanges.isFetching)
              ? 'animate-spin'
              : ''
          }`}
        />
      </Button>
    </div>
  );
}

/** Effective data derived from selected machine (local or remote snapshot) */
interface EffectiveLocalData {
  branch: string;
  fileCount: number;
  staged: number;
  unstaged: number;
  untracked: number;
}

interface LocalInfoDropdownProps {
  effectiveData: EffectiveLocalData;
}

/**
 * Info-only dropdown content for local changes view.
 * Shows branch name and file change stats.
 * Displays data from selected machine (local or remote snapshot).
 */
function LocalInfoDropdown({ effectiveData }: LocalInfoDropdownProps) {
  const { branch, fileCount, staged, unstaged, untracked } = effectiveData;

  return (
    <Dropdown.Section>
      <Header>Branch Info</Header>

      {/* Branch name */}
      <Dropdown.Item id="branch-info" textValue="Branch info" className="pointer-events-none">
        <GitBranch className="w-4 h-4 shrink-0 text-muted-foreground" />
        <Label className="font-mono text-sm text-foreground">{branch}</Label>
      </Dropdown.Item>

      {/* File change stats */}
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
              {untracked > 0 && (
                <Chip size="sm" color="default" className="flex items-center gap-0.5">
                  <Plus className="w-3 h-3" />
                  {untracked} untracked
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

/**
 * Info-only dropdown content for PR view.
 * Shows PR details and actions (Publish, GitHub link).
 * Displays actionable error messages with fix buttons when publish fails.
 */
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

        {/* PR number and status */}
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

        {/* Branch name */}
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

      {/* Publish Error Alert */}
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

            {/* Action button based on error type */}
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

      {/* Actions - Publish and GitHub link */}
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

/** --- Machine Dropdown --- */

interface MachineDropdownProps {
  machinePicker: MachinePickerState;
  /** Render compact mobile version */
  isMobile?: boolean;
}

/**
 * Dropdown to select which machine's changes to view.
 * Shows machine name, live/snapshot status, file count, and +/- stats.
 */
function MachineDropdown({ machinePicker, isMobile = false }: MachineDropdownProps) {
  const { snapshots, localMachineId, selectedMachineId, onSelectMachine } = machinePicker;

  /** Sort snapshots: local first, then live, then by update time */
  const sortedSnapshots = useMemo(() => {
    return Array.from(snapshots.entries()).sort(([idA, a], [idB, b]) => {
      if (idA === localMachineId) return -1;
      if (idB === localMachineId) return 1;
      if (a.isLive !== b.isLive) return a.isLive ? -1 : 1;
      return b.updatedAt - a.updatedAt;
    });
  }, [snapshots, localMachineId]);

  /** Get the currently selected snapshot for display in trigger */
  const selectedSnapshot = selectedMachineId
    ? snapshots.get(selectedMachineId)
    : sortedSnapshots[0]?.[1];

  const displayName = selectedSnapshot?.machineName ?? 'Select machine';
  const isLocal =
    selectedMachineId === localMachineId ||
    (!selectedMachineId && sortedSnapshots[0]?.[0] === localMachineId);

  const handleAction = useCallback(
    (key: React.Key) => {
      const machineId = String(key);
      /** If selecting the local machine, clear selection to use default local behavior */
      if (machineId === localMachineId) {
        onSelectMachine(null);
      } else {
        onSelectMachine(machineId);
      }
    },
    [localMachineId, onSelectMachine]
  );

  /** Mobile: compact button with just icon and count */
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

  /** Desktop: full button with name and chips */
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

/**
 * Individual machine item in the dropdown.
 * Shows machine name, status chip, file count, +/- stats, and relative time.
 */
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
        {/* Row 1: Machine name + status chips */}
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
          <Chip
            size="sm"
            color={snapshot.isLive ? 'success' : 'default'}
            variant="soft"
            className="h-4 text-[10px] shrink-0"
          >
            {snapshot.isLive ? 'Live' : 'Snapshot'}
          </Chip>
        </div>

        {/* Row 2: Stats */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span>
              {snapshot.files.length} file{snapshot.files.length !== 1 ? 's' : ''}
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
