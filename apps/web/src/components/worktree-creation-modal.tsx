import {
  Button,
  Description,
  Dropdown,
  FieldError,
  Input,
  Label,
  Modal,
  TextField,
} from '@heroui/react';
import { BRANCH_NAME_PATTERN } from '@shipyard/session';
import { ChevronDown, ChevronUp, FolderGit2, GitBranch, Loader2, Terminal } from 'lucide-react';
import { useCallback, useId, useMemo, useState } from 'react';
import type { GitRepoInfo } from '../hooks/use-machine-selection';
import { navigateToSettings } from '../utils/url-sync';
import { isWorktreePath } from '../utils/worktree-helpers';

interface WorktreeCreationModalProps {
  isOpen: boolean;
  onClose: () => void;
  sourceRepo: GitRepoInfo | null;
  environments: GitRepoInfo[];
  onSubmit: (params: {
    sourceRepoPath: string;
    branchName: string;
    baseRef: string;
    setupScript: string | null;
  }) => void;
  isCreating: boolean;
  worktreeScripts?: Map<string, { script: string }>;
}

function isWorktree(env: GitRepoInfo): boolean {
  return isWorktreePath(env.path);
}

function validateBranchName(name: string): string | null {
  if (!name.trim()) return 'Branch name is required';
  if (!BRANCH_NAME_PATTERN.test(name)) {
    return 'Only letters, numbers, /, -, _, and . are allowed';
  }
  return null;
}

/** Collapsible disclosure for the setup script that runs after worktree creation. */
function SetupScriptDisclosure({
  setupScript,
  editedScript,
  onEditScript,
  onClose,
}: {
  setupScript: string;
  editedScript: string | null;
  onEditScript: (value: string | null) => void;
  onClose: () => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const panelId = useId();
  const ChevronIcon = isExpanded ? ChevronUp : ChevronDown;

  return (
    <div className="rounded-lg border border-separator">
      <button
        type="button"
        aria-expanded={isExpanded}
        aria-controls={panelId}
        className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm text-foreground/80 hover:bg-default/30 rounded-lg transition-colors"
        onClick={() => setIsExpanded((prev) => !prev)}
      >
        <Terminal className="w-3.5 h-3.5 text-muted shrink-0" aria-hidden="true" />
        <span className="flex-1 min-w-0 truncate">Setup: {setupScript.split('\n')[0]}</span>
        <ChevronIcon className="w-3.5 h-3.5 text-muted shrink-0" aria-hidden="true" />
      </button>
      {isExpanded && (
        <div id={panelId} className="px-3 pb-3 space-y-2">
          <textarea
            value={editedScript ?? setupScript}
            onChange={(e) => onEditScript(e.target.value)}
            rows={3}
            className="w-full font-mono text-xs bg-default/30 text-foreground rounded-lg p-2 border border-separator resize-y outline-none focus:ring-1 focus:ring-accent"
            aria-label="Setup script"
          />
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted">Runs after worktree is created.</p>
            <button
              type="button"
              className="text-xs text-accent hover:underline"
              onClick={() => {
                onClose();
                navigateToSettings();
              }}
            >
              Edit default in Settings
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: modal orchestrating multiple form states with conditional repo selection requires branching logic
export function WorktreeCreationModal({
  isOpen,
  onClose,
  sourceRepo,
  environments,
  onSubmit,
  isCreating,
  worktreeScripts,
}: WorktreeCreationModalProps) {
  const [branchName, setBranchName] = useState('');
  const [baseRef, setBaseRef] = useState('main');
  const [branchError, setBranchError] = useState<string | null>(null);
  const [selectedRepoPath, setSelectedRepoPath] = useState<string | null>(null);
  const [editedScript, setEditedScript] = useState<string | null>(null);

  const mainRepos = useMemo(() => environments.filter((env) => !isWorktree(env)), [environments]);

  const effectiveRepo = sourceRepo ?? mainRepos.find((r) => r.path === selectedRepoPath) ?? null;

  const setupScript = effectiveRepo
    ? (worktreeScripts?.get(effectiveRepo.path)?.script ?? null)
    : null;
  const resolvedScript = editedScript ?? setupScript;

  const handleSubmit = useCallback(() => {
    if (!effectiveRepo) return;
    const validationError = validateBranchName(branchName);
    if (validationError) {
      setBranchError(validationError);
      return;
    }
    onSubmit({
      sourceRepoPath: effectiveRepo.path,
      branchName: branchName.trim(),
      baseRef: baseRef.trim() || 'main',
      setupScript: resolvedScript,
    });
  }, [branchName, baseRef, effectiveRepo, onSubmit, resolvedScript]);

  const handleBranchChange = useCallback((value: string) => {
    setBranchName(value);
    if (value.trim()) {
      setBranchError(validateBranchName(value));
    } else {
      setBranchError(null);
    }
  }, []);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open && !isCreating) {
        onClose();
        setBranchName('');
        setBaseRef('main');
        setBranchError(null);
        setSelectedRepoPath(null);
        setEditedScript(null);
      }
    },
    [onClose, isCreating]
  );

  const isSubmitDisabled = !effectiveRepo || !branchName.trim() || !!branchError || isCreating;

  return (
    <Modal.Backdrop isOpen={isOpen} onOpenChange={handleOpenChange} isDismissable={!isCreating}>
      <Modal.Container placement="center" size="sm">
        <Modal.Dialog aria-labelledby="worktree-dialog-title">
          {!isCreating && <Modal.CloseTrigger />}
          <div className="bg-overlay rounded-xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <GitBranch className="w-4 h-4 text-muted" aria-hidden="true" />
              <h2 id="worktree-dialog-title" className="text-base font-medium text-foreground">
                New Worktree
              </h2>
            </div>

            <div className="space-y-4">
              {sourceRepo ? (
                <div className="rounded-lg bg-default/40 px-3 py-2">
                  <p className="text-xs text-muted">Source repository</p>
                  <p className="text-sm text-foreground">{sourceRepo.name}</p>
                  <p className="text-xs text-muted truncate">{sourceRepo.path}</p>
                </div>
              ) : (
                <div>
                  <p className="text-sm text-foreground mb-1.5">Source repository</p>
                  {mainRepos.length > 0 ? (
                    <Dropdown>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-between text-sm border border-separator"
                        aria-label="Select source repository"
                      >
                        <span className="flex items-center gap-2 min-w-0 truncate">
                          <FolderGit2
                            className="w-3.5 h-3.5 text-muted shrink-0"
                            aria-hidden="true"
                          />
                          {effectiveRepo ? effectiveRepo.name : 'Select a repository...'}
                        </span>
                        <ChevronDown
                          className="w-3.5 h-3.5 text-muted shrink-0"
                          aria-hidden="true"
                        />
                      </Button>
                      <Dropdown.Popover placement="bottom" className="min-w-[260px]">
                        <Dropdown.Menu
                          selectionMode="single"
                          selectedKeys={
                            selectedRepoPath ? new Set([selectedRepoPath]) : new Set<string>()
                          }
                          onSelectionChange={(keys) => {
                            const selected = [...keys][0];
                            if (typeof selected === 'string') {
                              setSelectedRepoPath(selected);
                              setEditedScript(null);
                            }
                          }}
                        >
                          {mainRepos.map((repo) => (
                            <Dropdown.Item key={repo.path} id={repo.path} textValue={repo.name}>
                              <div className="flex flex-col min-w-0">
                                <Label className="text-sm">{repo.name}</Label>
                                <span className="text-xs text-muted truncate">
                                  {repo.branch} &middot; {repo.path}
                                </span>
                              </div>
                            </Dropdown.Item>
                          ))}
                        </Dropdown.Menu>
                      </Dropdown.Popover>
                    </Dropdown>
                  ) : (
                    <div className="rounded-lg bg-default/40 px-3 py-2">
                      <p className="text-xs text-muted">No repositories available</p>
                    </div>
                  )}
                </div>
              )}

              <TextField
                isRequired
                isInvalid={!!branchError}
                autoFocus={!!sourceRepo}
                value={branchName}
                onChange={handleBranchChange}
              >
                <Label className="text-sm text-foreground">Branch name</Label>
                <Input placeholder="feat/my-feature" className="text-sm" />
                {branchError && (
                  <FieldError className="text-xs text-danger mt-1">{branchError}</FieldError>
                )}
              </TextField>

              <TextField value={baseRef} onChange={setBaseRef}>
                <Label className="text-sm text-foreground">Base ref</Label>
                <Input placeholder="main" className="text-sm" />
                <Description className="text-xs text-muted mt-1">
                  Branch or commit to base the worktree on
                </Description>
              </TextField>

              {setupScript != null && setupScript.length > 0 && (
                <SetupScriptDisclosure
                  setupScript={setupScript}
                  editedScript={editedScript}
                  onEditScript={setEditedScript}
                  onClose={onClose}
                />
              )}
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <Button variant="ghost" size="sm" onPress={onClose} isDisabled={isCreating}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onPress={handleSubmit}
                isDisabled={isSubmitDisabled}
              >
                {isCreating && (
                  <Loader2 className="w-3.5 h-3.5 motion-safe:animate-spin" aria-hidden="true" />
                )}
                {isCreating ? 'Creating...' : 'Create'}
              </Button>
            </div>
          </div>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
