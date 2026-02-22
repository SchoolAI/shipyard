import { Button, Chip, Description, Dropdown, Label, Switch } from '@heroui/react';
import { change, type TypedDoc } from '@loro-extended/change';
import { useDoc } from '@loro-extended/react';
import type {
  AnthropicLoginResponseEphemeralValue,
  MachineCapabilitiesEphemeralValue,
  PermissionMode,
  ReasoningEffort,
  TaskIndexDocumentShape,
  WorktreeScriptValue,
} from '@shipyard/loro-schema';
import {
  buildDocumentId,
  DEFAULT_EPOCH,
  LOCAL_USER_ID,
  PERMISSION_MODES,
  REASONING_EFFORTS,
  ROOM_EPHEMERAL_DECLARATIONS,
  TaskIndexDocumentSchema,
} from '@shipyard/loro-schema';
import {
  ArrowLeft,
  Brain,
  CheckCircle,
  ChevronDown,
  ExternalLink,
  Key,
  Loader2,
  Monitor,
  Moon,
  Plus,
  Settings2,
  Shield,
  Terminal,
  Trash2,
  XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GitRepoInfo, MachineGroup } from '../hooks/use-machine-selection';
import type { RoomHandle } from '../hooks/use-room-handle';
import { useRepo } from '../providers/repo-provider';
import { isWorktreePath } from '../utils/worktree-helpers';

interface SettingsPageProps {
  onBack: () => void;
  availableEnvironments: GitRepoInfo[];
  machines: MachineGroup[];
  capabilitiesByMachine: Map<string, MachineCapabilitiesEphemeralValue>;
  roomHandle: RoomHandle;
}

function isWorktree(env: GitRepoInfo): boolean {
  return isWorktreePath(env.path);
}

function deriveRepoName(repoPath: string): string {
  const segments = repoPath.split('/').filter(Boolean);
  return segments[segments.length - 1] ?? repoPath;
}

/** Format the auth method for display. */
function formatAuthMethod(method: string): string {
  switch (method) {
    case 'api-key':
      return 'API Key';
    case 'oauth':
      return 'OAuth';
    case 'none':
      return 'None';
    default:
      return method;
  }
}

/** Get display color for auth status chip. */
function getAuthStatusColor(status: string): 'success' | 'warning' | 'default' {
  switch (status) {
    case 'authenticated':
      return 'success';
    case 'unauthenticated':
      return 'warning';
    default:
      return 'default';
  }
}

/** Get display label for auth status. */
function getAuthStatusLabel(status: string): string {
  switch (status) {
    case 'authenticated':
      return 'Authenticated';
    case 'unauthenticated':
      return 'Not authenticated';
    default:
      return 'Unknown';
  }
}

export function SettingsPage({
  onBack,
  availableEnvironments,
  machines,
  capabilitiesByMachine,
  roomHandle,
}: SettingsPageProps) {
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

  type KeepAwakeDoc = {
    userSettings: {
      keepMachineAwake: boolean;
    };
  };
  /* eslint-disable no-restricted-syntax -- loro-extended generic erasure requires cast */
  const keepMachineAwake = useDoc(
    roomDocHandle,
    (d) => (d as never as KeepAwakeDoc).userSettings.keepMachineAwake
  );
  /* eslint-enable no-restricted-syntax */

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

  const handleToggleKeepAwake = useCallback(
    (enabled: boolean) => {
      change(typedDoc, (draft) => {
        draft.userSettings.keepMachineAwake = enabled;
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

        <AnthropicAuthSection
          machines={machines}
          capabilitiesByMachine={capabilitiesByMachine}
          roomHandle={roomHandle}
        />

        <ComposerDefaultsSection
          typedDoc={typedDoc}
          roomDocHandle={roomDocHandle}
          capabilitiesByMachine={capabilitiesByMachine}
        />

        <section aria-labelledby="keep-awake-heading" className="mt-8">
          <div className="flex items-center gap-2 mb-4">
            <Moon className="w-4 h-4 text-muted" aria-hidden="true" />
            <h3 id="keep-awake-heading" className="text-base font-medium text-foreground">
              Keep Machine Awake
            </h3>
          </div>
          <p className="text-sm text-muted mb-4">
            Prevent your machine from sleeping while agent tasks are running.
          </p>
          <div className="flex items-center justify-between rounded-lg border border-separator bg-surface/50 px-3 py-2.5">
            <div className="flex items-center gap-2 min-w-0">
              <Moon className="w-3.5 h-3.5 text-muted shrink-0" aria-hidden="true" />
              <span className="text-sm text-foreground">Prevent idle sleep</span>
            </div>
            <Switch
              isSelected={keepMachineAwake ?? false}
              onChange={handleToggleKeepAwake}
              aria-label="Keep machine awake during tasks"
              size="sm"
            />
          </div>
        </section>

        <section aria-labelledby="worktree-scripts-heading" className="mt-8">
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

const VALID_EFFORTS: readonly string[] = REASONING_EFFORTS;
const VALID_MODES: readonly string[] = PERMISSION_MODES;

function isReasoningEffort(v: string): v is ReasoningEffort {
  return VALID_EFFORTS.includes(v);
}

function isPermissionMode(v: string): v is PermissionMode {
  return VALID_MODES.includes(v);
}

const PERMISSION_MODE_OPTIONS: { id: PermissionMode; label: string; description: string }[] = [
  { id: 'default', label: 'Default', description: 'Prompts for dangerous operations' },
  { id: 'accept-edits', label: 'Accept Edits', description: 'Auto-accept file edits' },
  { id: 'plan', label: 'Plan', description: 'No tool execution, planning only' },
  { id: 'bypass', label: 'Bypass', description: 'Skip all permission checks' },
];

const REASONING_OPTIONS: { id: string; label: string }[] = [
  { id: 'low', label: 'Low' },
  { id: 'medium', label: 'Medium' },
  { id: 'high', label: 'High' },
];

function ComposerDefaultsSection({
  typedDoc,
  roomDocHandle,
  capabilitiesByMachine,
}: {
  typedDoc: TypedDoc<TaskIndexDocumentShape>;
  // eslint-disable-next-line no-restricted-syntax -- loro-extended generics require permissive handle type
  roomDocHandle: Parameters<typeof useDoc>[0];
  capabilitiesByMachine: Map<string, MachineCapabilitiesEphemeralValue>;
}) {
  type UserSettingsDoc = {
    userSettings: {
      composerModel: string | null;
      composerReasoning: string | null;
      composerPermission: string | null;
    };
  };
  /* eslint-disable no-restricted-syntax -- loro-extended generic erasure requires cast */
  const currentModel = useDoc(
    roomDocHandle,
    (d) => (d as never as UserSettingsDoc).userSettings.composerModel
  );
  const currentReasoning = useDoc(
    roomDocHandle,
    (d) => (d as never as UserSettingsDoc).userSettings.composerReasoning
  );
  const currentPermission = useDoc(
    roomDocHandle,
    (d) => (d as never as UserSettingsDoc).userSettings.composerPermission
  );
  /* eslint-enable no-restricted-syntax */

  const availableModels = useMemo(() => {
    const models: { id: string; label: string; provider: string }[] = [];
    for (const caps of capabilitiesByMachine.values()) {
      for (const m of caps.models) {
        if (!models.some((existing) => existing.id === m.id)) {
          models.push({ id: m.id, label: m.label, provider: m.provider });
        }
      }
    }
    return models;
  }, [capabilitiesByMachine]);

  const modelDisplay = currentModel
    ? (availableModels.find((m) => m.id === currentModel)?.label ?? currentModel)
    : 'Claude Opus 4.6';

  const reasoningDisplay =
    REASONING_OPTIONS.find((r) => r.id === currentReasoning)?.label ?? 'Medium';

  const permissionDisplay =
    PERMISSION_MODE_OPTIONS.find((p) => p.id === currentPermission)?.label ?? 'Default';

  const handleModelChange = useCallback(
    (modelId: string) => {
      change(typedDoc, (draft) => {
        draft.userSettings.composerModel = modelId;
      });
    },
    [typedDoc]
  );

  const handleReasoningChange = useCallback(
    (effort: ReasoningEffort) => {
      change(typedDoc, (draft) => {
        draft.userSettings.composerReasoning = effort;
      });
    },
    [typedDoc]
  );

  const handlePermissionChange = useCallback(
    (mode: PermissionMode) => {
      change(typedDoc, (draft) => {
        draft.userSettings.composerPermission = mode;
      });
    },
    [typedDoc]
  );

  return (
    <section aria-labelledby="composer-defaults-heading" className="mt-8">
      <div className="flex items-center gap-2 mb-4">
        <Settings2 className="w-4 h-4 text-muted" aria-hidden="true" />
        <h3 id="composer-defaults-heading" className="text-base font-medium text-foreground">
          Composer Defaults
        </h3>
      </div>
      <p className="text-sm text-muted mb-4">
        Default settings for new tasks. These auto-update when you change settings in a task, or set
        them explicitly here.
      </p>

      <div className="space-y-3">
        <div className="flex items-center justify-between rounded-lg border border-separator bg-surface/50 px-3 py-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <Monitor className="w-3.5 h-3.5 text-muted shrink-0" aria-hidden="true" />
            <span className="text-sm text-foreground">Model</span>
          </div>
          {availableModels.length > 0 ? (
            <Dropdown>
              <Button
                variant="ghost"
                size="sm"
                className="flex items-center gap-1 text-xs text-muted hover:text-foreground"
              >
                <span className="truncate max-w-[10rem]">{modelDisplay}</span>
                <ChevronDown className="w-3 h-3" aria-hidden="true" />
              </Button>
              <Dropdown.Popover placement="bottom end" className="min-w-[220px]">
                <Dropdown.Menu
                  selectionMode="single"
                  selectedKeys={new Set([currentModel ?? 'claude-opus-4-6'])}
                  onSelectionChange={(keys) => {
                    const selected = [...keys][0];
                    if (typeof selected === 'string') handleModelChange(selected);
                  }}
                >
                  {availableModels.map((model) => (
                    <Dropdown.Item key={model.id} id={model.id} textValue={model.label}>
                      <Label>{model.label}</Label>
                      <Description>{model.provider}</Description>
                    </Dropdown.Item>
                  ))}
                </Dropdown.Menu>
              </Dropdown.Popover>
            </Dropdown>
          ) : (
            <span className="text-xs text-muted">{modelDisplay}</span>
          )}
        </div>

        <div className="flex items-center justify-between rounded-lg border border-separator bg-surface/50 px-3 py-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <Brain className="w-3.5 h-3.5 text-muted shrink-0" aria-hidden="true" />
            <span className="text-sm text-foreground">Reasoning Effort</span>
          </div>
          <Dropdown>
            <Button
              variant="ghost"
              size="sm"
              className="flex items-center gap-1 text-xs text-muted hover:text-foreground"
            >
              {reasoningDisplay}
              <ChevronDown className="w-3 h-3" aria-hidden="true" />
            </Button>
            <Dropdown.Popover placement="bottom end" className="min-w-[140px]">
              <Dropdown.Menu
                selectionMode="single"
                selectedKeys={new Set([currentReasoning ?? 'medium'])}
                onSelectionChange={(keys) => {
                  const selected = [...keys][0];
                  if (typeof selected === 'string' && isReasoningEffort(selected))
                    handleReasoningChange(selected);
                }}
              >
                {REASONING_OPTIONS.map((r) => (
                  <Dropdown.Item key={r.id} id={r.id} textValue={r.label}>
                    <Label>{r.label}</Label>
                  </Dropdown.Item>
                ))}
              </Dropdown.Menu>
            </Dropdown.Popover>
          </Dropdown>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-separator bg-surface/50 px-3 py-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <Shield className="w-3.5 h-3.5 text-muted shrink-0" aria-hidden="true" />
            <span className="text-sm text-foreground">Permission Mode</span>
          </div>
          <Dropdown>
            <Button
              variant="ghost"
              size="sm"
              className="flex items-center gap-1 text-xs text-muted hover:text-foreground"
            >
              {permissionDisplay}
              <ChevronDown className="w-3 h-3" aria-hidden="true" />
            </Button>
            <Dropdown.Popover placement="bottom end" className="min-w-[240px]">
              <Dropdown.Menu
                selectionMode="single"
                selectedKeys={new Set([currentPermission ?? 'default'])}
                onSelectionChange={(keys) => {
                  const selected = [...keys][0];
                  if (typeof selected === 'string' && isPermissionMode(selected))
                    handlePermissionChange(selected);
                }}
              >
                {PERMISSION_MODE_OPTIONS.map((p) => (
                  <Dropdown.Item key={p.id} id={p.id} textValue={p.label}>
                    <Label>{p.label}</Label>
                    <Description>{p.description}</Description>
                  </Dropdown.Item>
                ))}
              </Dropdown.Menu>
            </Dropdown.Popover>
          </Dropdown>
        </div>
      </div>
    </section>
  );
}

interface AnthropicAuthSectionProps {
  machines: MachineGroup[];
  capabilitiesByMachine: Map<string, MachineCapabilitiesEphemeralValue>;
  roomHandle: RoomHandle;
}

function AnthropicAuthSection({
  machines,
  capabilitiesByMachine,
  roomHandle,
}: AnthropicAuthSectionProps) {
  return (
    <section aria-labelledby="anthropic-auth-heading">
      <div className="flex items-center gap-2 mb-4">
        <Key className="w-4 h-4 text-muted" aria-hidden="true" />
        <h3 id="anthropic-auth-heading" className="text-base font-medium text-foreground">
          Anthropic Authentication
        </h3>
      </div>
      <p className="text-sm text-muted mb-4">
        Manage Anthropic authentication on your connected machines. Each machine can authenticate
        independently via API key or OAuth.
      </p>

      {machines.length === 0 ? (
        <div className="rounded-lg border border-separator bg-surface/50 px-4 py-6 text-center">
          <Monitor className="w-6 h-6 text-muted mx-auto mb-2" aria-hidden="true" />
          <p className="text-sm text-muted">No machines connected.</p>
          <p className="text-xs text-muted mt-1">
            Connect a machine to manage its Anthropic authentication.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {machines.map((machine) => {
            const capabilities = capabilitiesByMachine.get(machine.machineId);
            const auth = capabilities?.anthropicAuth ?? null;
            return (
              <MachineAuthCard
                key={machine.machineId}
                machineId={machine.machineId}
                machineName={machine.machineName}
                auth={auth}
                roomHandle={roomHandle}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

interface MachineAuthCardProps {
  machineId: string;
  machineName: string;
  auth: MachineCapabilitiesEphemeralValue['anthropicAuth'];
  roomHandle: RoomHandle;
}

function MachineAuthCard({ machineId, machineName, auth, roomHandle }: MachineAuthCardProps) {
  const [loginState, setLoginState] = useState<{
    requestId: string;
    status: AnthropicLoginResponseEphemeralValue['status'] | 'pending';
    loginUrl: string | null;
    error: string | null;
  } | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  /** Subscribe to login response ephemeral for the active requestId. */
  useEffect(() => {
    if (!loginState?.requestId) return;
    if (loginState.status === 'done' || loginState.status === 'error') return;

    const unsub = roomHandle.anthropicLoginResps.subscribe(({ key, value }) => {
      if (key !== loginState.requestId) return;
      if (!value) return;

      setLoginState((prev) => {
        if (!prev || prev.requestId !== key) return prev;
        return {
          ...prev,
          status: value.status,
          loginUrl: value.loginUrl,
          error: value.error,
        };
      });
    });

    return unsub;
  }, [roomHandle, loginState?.requestId, loginState?.status]);

  /** Auto-clear success message after a delay. */
  useEffect(() => {
    if (loginState?.status !== 'done') return;
    setShowSuccess(true);
    const timer = setTimeout(() => {
      setShowSuccess(false);
      setLoginState(null);
    }, 3000);
    return () => clearTimeout(timer);
  }, [loginState?.status]);

  const handleLogin = useCallback(() => {
    const requestId = crypto.randomUUID();
    setLoginState({ requestId, status: 'pending', loginUrl: null, error: null });

    roomHandle.anthropicLoginReqs.set(requestId, {
      machineId,
      requestedAt: Date.now(),
    });
  }, [machineId, roomHandle]);

  const isAuthenticated = auth?.status === 'authenticated';
  const isLoginInProgress =
    loginState !== null && loginState.status !== 'done' && loginState.status !== 'error';

  return (
    <div className="rounded-lg border border-separator bg-surface/50 p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <Monitor className="w-3.5 h-3.5 text-muted shrink-0" aria-hidden="true" />
          <span className="text-sm font-medium text-foreground truncate">{machineName}</span>
        </div>
        {auth && (
          <Chip size="sm" variant="soft" color={getAuthStatusColor(auth.status)}>
            {getAuthStatusLabel(auth.status)}
          </Chip>
        )}
      </div>

      {auth ? (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            <span>
              Method: <span className="text-foreground">{formatAuthMethod(auth.method)}</span>
            </span>
            {auth.email && (
              <span>
                Email: <span className="text-foreground">{auth.email}</span>
              </span>
            )}
          </div>

          {!isAuthenticated && !isLoginInProgress && !showSuccess && (
            <Button variant="ghost" size="sm" onPress={handleLogin} className="text-sm mt-1">
              <Key className="w-3.5 h-3.5" aria-hidden="true" />
              Login with Claude
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted">Authentication status unknown.</p>
          {!isLoginInProgress && !showSuccess && (
            <Button variant="ghost" size="sm" onPress={handleLogin} className="text-sm">
              <Key className="w-3.5 h-3.5" aria-hidden="true" />
              Login with Claude
            </Button>
          )}
        </div>
      )}

      <LoginProgress loginState={loginState} showSuccess={showSuccess} />
    </div>
  );
}

interface LoginProgressProps {
  loginState: {
    requestId: string;
    status: string;
    loginUrl: string | null;
    error: string | null;
  } | null;
  showSuccess: boolean;
}

function LoginProgress({ loginState, showSuccess }: LoginProgressProps) {
  if (!loginState) return null;

  if (showSuccess) {
    return (
      <div
        className="flex items-center gap-2 mt-2 text-sm text-success"
        role="status"
        aria-live="polite"
      >
        <CheckCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
        <span>Authenticated successfully</span>
      </div>
    );
  }

  if (loginState.status === 'error') {
    return (
      <div className="flex items-center gap-2 mt-2 text-sm text-danger" role="alert">
        <XCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
        <span>{loginState.error ?? 'Login failed'}</span>
      </div>
    );
  }

  if (loginState.status === 'pending' || loginState.status === 'starting') {
    return (
      <div
        className="flex items-center gap-2 mt-2 text-sm text-muted"
        role="status"
        aria-live="polite"
      >
        <Loader2 className="w-4 h-4 shrink-0 animate-spin" aria-hidden="true" />
        <span>Starting login...</span>
      </div>
    );
  }

  if (loginState.status === 'waiting' && loginState.loginUrl) {
    return (
      <div className="mt-2 space-y-2" role="status" aria-live="polite">
        <div className="flex items-center gap-2 text-sm text-muted">
          <Loader2 className="w-4 h-4 shrink-0 animate-spin" aria-hidden="true" />
          <span>Waiting for authentication...</span>
        </div>
        <a
          href={loginState.loginUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline"
        >
          Open login page
          <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
        </a>
      </div>
    );
  }

  return null;
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
