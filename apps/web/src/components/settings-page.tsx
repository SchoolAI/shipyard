import { Button } from '@heroui/react';
import { change, type TypedDoc } from '@loro-extended/change';
import { useDoc } from '@loro-extended/react';
import type { TaskIndexDocumentShape, WorktreeScriptValue } from '@shipyard/loro-schema';
import {
  buildDocumentId,
  DEFAULT_EPOCH,
  LOCAL_USER_ID,
  ROOM_EPHEMERAL_DECLARATIONS,
  TaskIndexDocumentSchema,
} from '@shipyard/loro-schema';
import { ArrowLeft, Plus, Terminal, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GitRepoInfo } from '../hooks/use-machine-selection';
import { useRepo } from '../providers/repo-provider';
import { isWorktreePath } from '../utils/worktree-helpers';

interface SettingsPageProps {
  onBack: () => void;
  availableEnvironments: GitRepoInfo[];
}

function isWorktree(env: GitRepoInfo): boolean {
  return isWorktreePath(env.path);
}

function deriveRepoName(repoPath: string): string {
  const segments = repoPath.split('/').filter(Boolean);
  return segments[segments.length - 1] ?? repoPath;
}

export function SettingsPage({ onBack, availableEnvironments }: SettingsPageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);

  const repo = useRepo();
  const roomDocId = useMemo(() => buildDocumentId('room', LOCAL_USER_ID, DEFAULT_EPOCH), []);
  // eslint-disable-next-line no-restricted-syntax -- loro-extended generics require explicit cast
  const roomDocHandle = useMemo(
    () => repo.get(roomDocId, TaskIndexDocumentSchema as never, ROOM_EPHEMERAL_DECLARATIONS),
    [repo, roomDocId]
  );

  const worktreeScriptsRecord = useDoc(
    roomDocHandle,
    (d: { userSettings: { worktreeScripts: Record<string, WorktreeScriptValue> } }) =>
      d.userSettings.worktreeScripts
  );

  const scripts = useMemo(
    () => new Map(Object.entries(worktreeScriptsRecord ?? {})),
    [worktreeScriptsRecord]
  );

  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  const mainRepos = availableEnvironments.filter((env) => !isWorktree(env));

  const unconfiguredRepos = mainRepos.filter((repo) => !scripts.has(repo.path));

  // eslint-disable-next-line no-restricted-syntax -- loro-extended generic erasure requires cast from TypedDoc<never> to concrete shape
  const typedDoc = roomDocHandle.doc as unknown as TypedDoc<TaskIndexDocumentShape>;

  const handleAddScript = useCallback(
    (repoPath: string) => {
      change(typedDoc, (draft) => {
        draft.userSettings.worktreeScripts.set(repoPath, { script: 'pnpm install' });
      });
      setIsAddMenuOpen(false);
    },
    [typedDoc]
  );

  const handleRemoveScript = useCallback(
    (repoPath: string) => {
      change(typedDoc, (draft) => {
        draft.userSettings.worktreeScripts.delete(repoPath);
      });
    },
    [typedDoc]
  );

  const handleUpdateScript = useCallback(
    (repoPath: string, script: string) => {
      change(typedDoc, (draft) => {
        draft.userSettings.worktreeScripts.set(repoPath, { script });
      });
    },
    [typedDoc]
  );

  return (
    <div
      ref={containerRef}
      role="region"
      aria-labelledby="settings-heading"
      tabIndex={-1}
      className="flex-1 overflow-y-auto focus-visible-ring"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onBack();
        }
      }}
    >
      <div className="max-w-3xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
        <div className="flex items-center gap-3 mb-8">
          <button
            type="button"
            aria-label="Back to chat"
            className="flex items-center justify-center w-11 h-11 sm:w-8 sm:h-8 rounded-lg text-muted hover:text-foreground hover:bg-default/30 transition-colors"
            onClick={onBack}
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h2 className="text-xl font-semibold text-foreground" id="settings-heading">
            Settings
          </h2>
        </div>

        <section aria-labelledby="worktree-scripts-heading">
          <div className="flex items-center gap-2 mb-4">
            <Terminal className="w-4 h-4 text-muted" aria-hidden="true" />
            <h3 id="worktree-scripts-heading" className="text-base font-medium text-foreground">
              Worktree Setup Scripts
            </h3>
          </div>
          <p className="text-sm text-muted mb-4">
            Configure scripts that run automatically after creating a worktree from a repository.
            Common uses: installing dependencies, setting up environment files, running builds.
          </p>

          {scripts.size > 0 && (
            <div className="space-y-3 mb-4">
              {Array.from(scripts.entries()).map(([repoPath, entry]) => (
                <ScriptCard
                  key={repoPath}
                  repoPath={repoPath}
                  repoName={deriveRepoName(repoPath)}
                  script={entry.script}
                  onUpdate={handleUpdateScript}
                  onRemove={handleRemoveScript}
                />
              ))}
            </div>
          )}

          {scripts.size === 0 && (
            <div className="rounded-lg border border-separator bg-surface/50 px-4 py-6 text-center mb-4">
              <Terminal className="w-6 h-6 text-muted mx-auto mb-2" aria-hidden="true" />
              <p className="text-sm text-muted">No setup scripts configured yet.</p>
              <p className="text-xs text-muted mt-1">
                Add a script to run after creating worktrees from a repository.
              </p>
            </div>
          )}

          {unconfiguredRepos.length > 0 && (
            <div className="relative">
              <Button
                variant="ghost"
                size="sm"
                onPress={() => setIsAddMenuOpen((prev) => !prev)}
                className="text-sm"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                Add setup script
              </Button>
              {isAddMenuOpen && (
                <>
                  {/* biome-ignore lint/a11y/useKeyWithClickEvents: backdrop dismissal for dropdown menu */}
                  {/* biome-ignore lint/a11y/noStaticElementInteractions: backdrop dismissal for dropdown menu */}
                  <div className="fixed inset-0 z-40" onClick={() => setIsAddMenuOpen(false)} />
                  <div
                    role="menu"
                    className="absolute left-0 top-full mt-1 z-50 min-w-[260px] rounded-lg border border-separator bg-overlay shadow-lg py-1"
                  >
                    {unconfiguredRepos.map((repo) => (
                      <button
                        key={repo.path}
                        role="menuitem"
                        type="button"
                        className="flex flex-col items-start w-full px-3 py-2 text-left hover:bg-default/50 transition-colors"
                        onClick={() => handleAddScript(repo.path)}
                      >
                        <span className="text-sm text-foreground">{repo.name}</span>
                        <span className="text-xs text-muted truncate max-w-full">{repo.path}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

interface ScriptCardProps {
  repoPath: string;
  repoName: string;
  script: string;
  onUpdate: (repoPath: string, script: string) => void;
  onRemove: (repoPath: string) => void;
}

function ScriptCard({ repoPath, repoName, script, onUpdate, onRemove }: ScriptCardProps) {
  const [localScript, setLocalScript] = useState(script);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    setLocalScript(script);
  }, [script]);

  const handleChange = useCallback(
    (value: string) => {
      setLocalScript(value);
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        onUpdate(repoPath, value);
      }, 500);
    },
    [repoPath, onUpdate]
  );

  const handleBlur = useCallback(() => {
    clearTimeout(debounceRef.current);
    if (localScript !== script) {
      onUpdate(repoPath, localScript);
    }
  }, [repoPath, localScript, script, onUpdate]);

  useEffect(() => {
    return () => clearTimeout(debounceRef.current);
  }, []);

  return (
    <div className="rounded-lg border border-separator bg-surface/50 p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <Terminal className="w-3.5 h-3.5 text-muted shrink-0" aria-hidden="true" />
          <span className="text-sm font-medium text-foreground truncate">{repoName}</span>
          <span className="text-xs text-muted truncate hidden sm:inline">{repoPath}</span>
        </div>
        <Button
          isIconOnly
          variant="ghost"
          size="sm"
          aria-label={`Remove setup script for ${repoName}`}
          onPress={() => onRemove(repoPath)}
          className="text-muted hover:text-danger min-w-11 min-h-11 sm:min-w-8 sm:min-h-8"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>
      <textarea
        value={localScript}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={handleBlur}
        rows={2}
        aria-label={`Setup script for ${repoName}`}
        className="w-full font-mono text-xs bg-default/30 text-foreground rounded-lg p-2 border border-separator resize-y outline-none focus:ring-1 focus:ring-accent"
      />
    </div>
  );
}
