import { Button, Header, ListBox, Popover, ScrollShadow, Tooltip } from '@heroui/react';
import {
  AlertCircle,
  Check,
  ChevronDown,
  FolderGit2,
  GitBranch,
  Globe,
  Home,
  Plus,
  Search,
} from 'lucide-react';
import type { Key } from 'react';
import { useCallback, useMemo, useRef, useState } from 'react';
import type { GitRepoInfo } from '../../hooks/use-machine-selection';
import { fuzzyScore } from '../../utils/fuzzy-match';
import { deriveParentRepoPath, isWorktreePath } from '../../utils/worktree-helpers';

const HOME_KEY = '__home__';

export interface EnvironmentPickerProps {
  environments: GitRepoInfo[];
  selectedPath: string | null;
  onSelect: (path: string | null) => void;
  homeDir?: string;
  onCreateWorktree?: (sourceRepo: GitRepoInfo) => void;
}

interface RepoGroup {
  parentPath: string;
  parentName: string;
  mainRepo: GitRepoInfo | null;
  worktrees: GitRepoInfo[];
}

function isWorktree(env: GitRepoInfo): boolean {
  return isWorktreePath(env.path);
}

function deriveParentName(env: GitRepoInfo): string {
  if (!isWorktree(env)) return env.name;
  const parentPath = deriveParentRepoPath(env.path);
  const lastSegment = parentPath.split('/').filter(Boolean).pop();
  return lastSegment ?? env.name;
}

function groupEnvironments(environments: GitRepoInfo[]): RepoGroup[] {
  const groupMap = new Map<string, RepoGroup>();

  for (const env of environments) {
    const parentPath = deriveParentRepoPath(env.path);
    let group = groupMap.get(parentPath);
    if (!group) {
      group = {
        parentPath,
        parentName: deriveParentName(env),
        mainRepo: null,
        worktrees: [],
      };
      groupMap.set(parentPath, group);
    }

    if (!isWorktree(env)) {
      group.mainRepo = env;
      group.parentName = env.name;
    } else {
      group.worktrees.push(env);
    }
  }

  const groups = [...groupMap.values()];
  groups.sort((a, b) => a.parentName.localeCompare(b.parentName));
  for (const group of groups) {
    group.worktrees.sort((a, b) => a.branch.localeCompare(b.branch));
  }
  return groups;
}

function computeLabel(
  selectedEnvironment: GitRepoInfo | undefined,
  isHomeDir: boolean,
  environmentCount: number
): string {
  if (isHomeDir) return '~ (Home)';
  if (selectedEnvironment) return `${selectedEnvironment.name} (${selectedEnvironment.branch})`;
  if (environmentCount > 0) return 'Select environment';
  return 'No environment';
}

function computeTooltip(
  hasUnselectedEnvironments: boolean,
  isHomeDir: boolean,
  label: string
): string {
  if (hasUnselectedEnvironments)
    return 'No environment selected \u2014 agent will use home directory';
  if (isHomeDir) return 'Home directory \u2014 select a project for better results';
  return label;
}

function HomeItem({ homeDir, isSelected }: { homeDir: string; isSelected: boolean }) {
  return (
    <ListBox.Item
      key={HOME_KEY}
      id={HOME_KEY}
      textValue="~ (Home directory)"
      className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
        isSelected ? 'bg-default' : 'hover:bg-default/50'
      }`}
    >
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <Home className="w-3.5 h-3.5 text-muted shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="text-sm text-foreground/90 truncate">~ (Home)</div>
          <div className="text-xs text-muted truncate">{homeDir}</div>
        </div>
        {isSelected && <Check className="w-3.5 h-3.5 text-accent shrink-0" aria-hidden="true" />}
      </div>
    </ListBox.Item>
  );
}

/** Branch/worktree item within a grouped section. */
function BranchItem({
  env,
  isSelected,
  isMainBranch,
}: {
  env: GitRepoInfo;
  isSelected: boolean;
  isMainBranch: boolean;
}) {
  const Icon = isMainBranch ? FolderGit2 : GitBranch;
  const relativePath = isWorktree(env)
    ? env.path.replace(/^.*-wt\//, '')
    : env.path.split('/').slice(-1).join('');

  return (
    <ListBox.Item
      key={env.path}
      id={env.path}
      textValue={`${env.name} (${env.branch})`}
      className={`flex items-center gap-2 pl-6 pr-3 py-1.5 rounded-lg transition-colors ${
        isSelected ? 'bg-default' : 'hover:bg-default/50'
      }`}
    >
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <Icon className="w-3.5 h-3.5 text-muted shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="text-sm text-foreground/90 truncate">{env.branch}</div>
          <div className="text-xs text-muted truncate">{relativePath}</div>
        </div>
        {isSelected && <Check className="w-3.5 h-3.5 text-accent shrink-0" aria-hidden="true" />}
      </div>
    </ListBox.Item>
  );
}

/** Flat item used in search results. Shows "+" for main repos when onCreateWorktree is provided. */
function FlatResultItem({
  env,
  isSelected,
  onCreateWorktree,
  onClosePopover,
}: {
  env: GitRepoInfo;
  isSelected: boolean;
  onCreateWorktree?: (sourceRepo: GitRepoInfo) => void;
  onClosePopover: () => void;
}) {
  const isWt = isWorktree(env);
  const Icon = isWt ? GitBranch : FolderGit2;
  const subtitle = isWt ? deriveParentName(env) : env.branch;
  const textValue = isWt
    ? `${env.name} (${env.branch}) in ${deriveParentName(env)}`
    : `${env.name} (${env.branch})`;
  const showCreate = !isWt && !!onCreateWorktree;

  return (
    <ListBox.Item
      key={env.path}
      id={env.path}
      textValue={textValue}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
        isSelected ? 'bg-default' : 'hover:bg-default/50'
      }`}
    >
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <Icon className="w-3.5 h-3.5 text-muted shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="text-sm text-foreground/90 truncate">{env.name}</div>
          <div className="text-xs text-muted truncate">{subtitle}</div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {showCreate && (
            <span
              role="presentation"
              onPointerDownCapture={(e) => e.stopPropagation()}
              onKeyDownCapture={(e) => e.stopPropagation()}
            >
              <Button
                isIconOnly
                variant="ghost"
                size="sm"
                aria-label={`Create worktree from ${env.name}`}
                className="text-muted hover:text-foreground min-w-11 min-h-11 sm:min-w-8 sm:min-h-8 w-8 h-8"
                onPress={() => {
                  onClosePopover();
                  onCreateWorktree(env);
                }}
              >
                <Plus className="w-3.5 h-3.5" />
              </Button>
            </span>
          )}
          {isSelected && <Check className="w-3.5 h-3.5 text-accent shrink-0" aria-hidden="true" />}
        </div>
      </div>
    </ListBox.Item>
  );
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: grouped vs flat search rendering requires branching logic that inflates complexity score
export function EnvironmentPicker({
  environments,
  selectedPath,
  onSelect,
  homeDir,
  onCreateWorktree,
}: EnvironmentPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  const selectedEnvironment = environments.find((e) => e.path === selectedPath);
  const isSelectedHomeDir = !!(
    selectedEnvironment &&
    homeDir &&
    selectedEnvironment.path === homeDir
  );
  const isUsingHomeDir = !selectedEnvironment && !!homeDir;
  const isHomeDir = isSelectedHomeDir || isUsingHomeDir;
  const hasUnselectedEnvironments = environments.length > 0 && !selectedEnvironment && !homeDir;

  const label = computeLabel(selectedEnvironment, isHomeDir, environments.length);
  const tooltipContent = computeTooltip(hasUnselectedEnvironments, isHomeDir, label);

  const repoGroups = useMemo(() => groupEnvironments(environments), [environments]);

  const filteredEnvironments = useMemo(() => {
    if (!query) return null;

    const scored = environments
      .map((env) => {
        const best = Math.max(
          fuzzyScore(query, env.name),
          fuzzyScore(query, env.path),
          fuzzyScore(query, env.branch)
        );
        return { env, score: best };
      })
      .filter((entry) => entry.score >= 0);

    scored.sort((a, b) => b.score - a.score);
    return scored.map((entry) => entry.env);
  }, [environments, query]);

  const isSearching = query.length > 0;

  const showHomeOption =
    homeDir && (!query || fuzzyScore(query, 'home') >= 0 || fuzzyScore(query, homeDir) >= 0);

  const handleOpenChange = useCallback((open: boolean) => {
    setIsOpen(open);
    if (open) {
      requestAnimationFrame(() => {
        searchRef.current?.focus();
      });
    } else {
      setQuery('');
    }
  }, []);

  const handleAction = useCallback(
    (key: Key) => {
      const keyStr = String(key);
      onSelect(keyStr === HOME_KEY ? null : keyStr);
      setIsOpen(false);
      setQuery('');
    },
    [onSelect]
  );

  if (environments.length === 0 && !homeDir) {
    return (
      <span className="flex items-center gap-1 text-xs text-muted">
        <Globe className="w-3 h-3" aria-hidden="true" />
        No environment
      </span>
    );
  }

  return (
    <Popover isOpen={isOpen} onOpenChange={handleOpenChange}>
      <Tooltip isDisabled={isOpen}>
        <Popover.Trigger>
          <Tooltip.Trigger>
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Environment: ${label}`}
              className={`flex items-center gap-1 transition-colors text-xs ${
                hasUnselectedEnvironments
                  ? 'text-warning hover:text-warning-600'
                  : 'text-muted hover:text-foreground'
              }`}
            >
              {hasUnselectedEnvironments ? (
                <AlertCircle className="w-3 h-3 shrink-0" aria-hidden="true" />
              ) : (
                <Globe className="w-3 h-3 shrink-0" aria-hidden="true" />
              )}
              <span className="truncate max-w-[4rem] sm:max-w-[8rem]">{label}</span>
              <ChevronDown className="w-2.5 h-2.5" aria-hidden="true" />
            </Button>
          </Tooltip.Trigger>
        </Popover.Trigger>
        <Tooltip.Content>{tooltipContent}</Tooltip.Content>
      </Tooltip>
      <Popover.Content placement="top" className="w-auto min-w-[240px] max-w-[340px] p-0">
        <Popover.Dialog>
          <div className="flex flex-col">
            <div className="px-3 py-2 border-b border-separator">
              <div className="flex items-center gap-2">
                <Search className="w-3.5 h-3.5 text-muted shrink-0" aria-hidden="true" />
                <input
                  ref={searchRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search environments..."
                  role="searchbox"
                  aria-controls="environment-listbox"
                  aria-label="Search environments"
                  className="w-full bg-transparent text-sm text-foreground placeholder-muted outline-none"
                />
              </div>
            </div>
            <ScrollShadow className="max-h-[240px]">
              {isSearching ? (
                (filteredEnvironments && filteredEnvironments.length > 0) || showHomeOption ? (
                  <ListBox
                    id="environment-listbox"
                    aria-label="Environments"
                    selectionMode="none"
                    onAction={handleAction}
                    className="p-1"
                  >
                    {showHomeOption && <HomeItem homeDir={homeDir} isSelected={isUsingHomeDir} />}
                    {filteredEnvironments?.map((env) => (
                      <FlatResultItem
                        key={env.path}
                        env={env}
                        isSelected={env.path === selectedPath}
                        onCreateWorktree={onCreateWorktree}
                        onClosePopover={() => {
                          setIsOpen(false);
                          setQuery('');
                        }}
                      />
                    ))}
                  </ListBox>
                ) : (
                  <div className="px-3 py-4 text-center text-xs text-muted">
                    No environments match &ldquo;{query}&rdquo;
                  </div>
                )
              ) : repoGroups.length > 0 || showHomeOption ? (
                <ListBox
                  id="environment-listbox"
                  aria-label="Environments"
                  selectionMode="none"
                  onAction={handleAction}
                  className="p-1"
                >
                  {showHomeOption && <HomeItem homeDir={homeDir} isSelected={isUsingHomeDir} />}
                  {repoGroups.map((group) => (
                    <ListBox.Section key={group.parentPath}>
                      <Header className="flex items-center justify-between px-3 pt-2 pb-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <FolderGit2 className="w-3 h-3 text-muted shrink-0" aria-hidden="true" />
                          <span className="text-xs font-medium text-muted truncate">
                            {group.parentName}
                          </span>
                        </div>
                        {onCreateWorktree && group.mainRepo && (
                          <Button
                            isIconOnly
                            variant="ghost"
                            size="sm"
                            aria-label={`Create worktree from ${group.parentName}`}
                            className="text-muted hover:text-foreground min-w-11 min-h-11 sm:min-w-8 sm:min-h-8 w-8 h-8"
                            onPress={() => {
                              setIsOpen(false);
                              if (group.mainRepo) {
                                onCreateWorktree(group.mainRepo);
                              }
                            }}
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </Header>
                      {group.mainRepo && (
                        <BranchItem
                          key={group.mainRepo.path}
                          env={group.mainRepo}
                          isSelected={group.mainRepo.path === selectedPath}
                          isMainBranch
                        />
                      )}
                      {group.worktrees.map((wt) => (
                        <BranchItem
                          key={wt.path}
                          env={wt}
                          isSelected={wt.path === selectedPath}
                          isMainBranch={false}
                        />
                      ))}
                    </ListBox.Section>
                  ))}
                </ListBox>
              ) : (
                <div className="px-3 py-4 text-center text-xs text-muted">
                  No environments available
                </div>
              )}
            </ScrollShadow>
          </div>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}
