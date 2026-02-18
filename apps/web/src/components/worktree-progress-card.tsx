import { Button } from '@heroui/react';
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronUp,
  Circle,
  FileText,
  GitBranch,
  Loader2,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { assertNever } from '../utils/assert-never';

interface WorktreeProgressCardProps {
  branchName: string;
  currentStep: string;
  isComplete: boolean;
  isError: boolean;
  errorMessage?: string;
  warnings?: string[];
  onSwitchToWorktree?: () => void;
  onDismiss: () => void;
  /** Whether a setup script was started after worktree creation */
  setupScriptStarted?: boolean;
  /** Current status of the setup script lifecycle */
  setupStatus?: 'running' | 'done' | 'failed';
  /** Exit code of the setup script (null if killed by signal) */
  setupExitCode?: number | null;
}

/** Phase 1 steps: worktree creation */
const CREATION_STEPS = [
  { key: 'creating-worktree', label: 'Creating worktree' },
  { key: 'copying-files', label: 'Copying files' },
  { key: 'refreshing-environments', label: 'Refreshing environments' },
] as const;

function creationStepIndex(step: string): number {
  return CREATION_STEPS.findIndex((s) => s.key === step);
}

function StepIndicator({ status }: { status: 'complete' | 'active' | 'pending' | 'failed' }) {
  switch (status) {
    case 'complete':
      return <Check className="w-3 h-3 text-success" aria-hidden="true" />;
    case 'active':
      return (
        <Loader2 className="w-3 h-3 text-accent motion-safe:animate-spin" aria-hidden="true" />
      );
    case 'pending':
      return <Circle className="w-3 h-3 text-muted/40" aria-hidden="true" />;
    case 'failed':
      return <X className="w-3 h-3 text-danger" aria-hidden="true" />;
    default:
      return assertNever(status);
  }
}

/**
 * Derive the border accent color from the overall state.
 * Priority: error > setup failed > setup running > creation complete > in progress
 */
function deriveBorderColor(
  isError: boolean,
  isComplete: boolean,
  setupStatus?: 'running' | 'done' | 'failed'
): string {
  if (isError) return 'border-l-danger';
  if (setupStatus === 'failed') return 'border-l-warning';
  if (setupStatus === 'running') return 'border-l-accent';
  if (isComplete) return 'border-l-success';
  return 'border-l-accent';
}

/**
 * Derive the label and disabled state for the switch-to-environment button.
 */
function deriveButtonState(
  setupScriptStarted?: boolean,
  setupStatus?: 'running' | 'done' | 'failed'
): {
  label: string;
  disabled: boolean;
  warningText?: string;
} {
  if (!setupScriptStarted || setupStatus === 'done') {
    return { label: 'Switch to environment', disabled: false };
  }
  if (setupStatus === 'running') {
    return {
      label: 'Switch to environment',
      disabled: false,
      warningText: '(setup still running)',
    };
  }
  if (setupStatus === 'failed') {
    return { label: 'Switch to environment', disabled: false, warningText: '(setup failed)' };
  }
  return { label: 'Switch to environment', disabled: false };
}

export function WorktreeProgressCard({
  branchName,
  currentStep,
  isComplete,
  isError,
  errorMessage,
  warnings,
  onSwitchToWorktree,
  onDismiss,
  setupScriptStarted,
  setupStatus,
  setupExitCode,
}: WorktreeProgressCardProps) {
  const [isLogPathExpanded, setIsLogPathExpanded] = useState(false);
  const currentIndex = creationStepIndex(currentStep);
  const borderColor = deriveBorderColor(isError, isComplete, setupStatus);
  const showSwitchButton = isComplete && onSwitchToWorktree;
  const buttonState = deriveButtonState(setupScriptStarted, setupStatus);

  return (
    <div
      role="status"
      aria-label={`Worktree creation: ${branchName}`}
      aria-live="polite"
      className={`border-l-3 ${borderColor} bg-surface rounded-xl border border-separator px-3 py-2.5 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <GitBranch className="w-3.5 h-3.5 text-muted shrink-0" aria-hidden="true" />
          <span className="text-sm text-foreground font-medium truncate">{branchName}</span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {showSwitchButton && (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onPress={onSwitchToWorktree}
                isDisabled={buttonState.disabled}
                className="text-xs text-accent hover:text-accent h-6"
              >
                {buttonState.label}
              </Button>
              {buttonState.warningText && (
                <span className="text-xs text-warning">{buttonState.warningText}</span>
              )}
            </div>
          )}
          <Button
            isIconOnly
            variant="ghost"
            size="sm"
            onPress={onDismiss}
            aria-label="Dismiss worktree progress"
            className="text-muted/50 hover:text-muted min-w-11 min-h-11 sm:min-w-8 sm:min-h-8 w-8 h-8"
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {isError ? (
        <div className="flex items-center gap-1.5 mt-1.5">
          <AlertCircle className="w-3 h-3 text-danger shrink-0" aria-hidden="true" />
          <span className="text-xs text-danger">{errorMessage ?? 'Worktree creation failed'}</span>
        </div>
      ) : (
        <div className="flex items-center gap-3 mt-1.5">
          {CREATION_STEPS.map((step, i) => {
            let status: 'complete' | 'active' | 'pending';
            if (isComplete) {
              status = 'complete';
            } else if (i < currentIndex) {
              status = 'complete';
            } else if (i === currentIndex) {
              status = 'active';
            } else {
              status = 'pending';
            }

            return (
              <div key={step.key} className="flex items-center gap-1">
                <StepIndicator status={status} />
                <span
                  className={`text-xs ${
                    status === 'active'
                      ? 'text-foreground'
                      : status === 'complete'
                        ? 'text-muted'
                        : 'text-muted/40'
                  }`}
                >
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {setupScriptStarted && isComplete && !isError && (
        <>
          <div className="border-t border-separator/50 my-2" />
          <SetupScriptStatus
            status={setupStatus}
            exitCode={setupExitCode}
            isLogPathExpanded={isLogPathExpanded}
            onToggleLogPath={() => setIsLogPathExpanded((prev) => !prev)}
          />
        </>
      )}

      {warnings && warnings.length > 0 && (
        <div className="mt-1.5">
          {warnings.map((warning, index) => (
            <p key={index} className="text-xs text-warning">
              {warning}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function SetupScriptStatus({
  status,
  exitCode,
  isLogPathExpanded,
  onToggleLogPath,
}: {
  status?: 'running' | 'done' | 'failed';
  exitCode?: number | null;
  isLogPathExpanded: boolean;
  onToggleLogPath: () => void;
}) {
  const resolvedStatus = status ?? 'running';

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <SetupStatusIndicator status={resolvedStatus} />
        <span
          className={`text-xs ${
            resolvedStatus === 'running'
              ? 'text-foreground'
              : resolvedStatus === 'done'
                ? 'text-muted'
                : 'text-danger'
          }`}
        >
          {resolvedStatus === 'running' && 'Running setup script...'}
          {resolvedStatus === 'done' && 'Setup complete'}
          {resolvedStatus === 'failed' &&
            `Setup failed${exitCode != null ? ` (exit code ${exitCode})` : ''}`}
        </span>
      </div>

      {resolvedStatus === 'failed' && (
        <div>
          <button
            type="button"
            className="flex items-center gap-1 text-xs text-muted hover:text-foreground transition-colors min-h-[32px] sm:min-h-0"
            onClick={onToggleLogPath}
            aria-expanded={isLogPathExpanded}
            aria-controls="setup-log-path"
          >
            <FileText className="w-3 h-3 shrink-0" aria-hidden="true" />
            <span>View log path</span>
            {isLogPathExpanded ? (
              <ChevronUp className="w-3 h-3 shrink-0" aria-hidden="true" />
            ) : (
              <ChevronDown className="w-3 h-3 shrink-0" aria-hidden="true" />
            )}
          </button>
          {isLogPathExpanded && (
            <p id="setup-log-path" className="text-xs text-muted/80 font-mono mt-1 pl-4 select-all">
              .shipyard/worktree-setup.log
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function SetupStatusIndicator({ status }: { status: 'running' | 'done' | 'failed' }) {
  switch (status) {
    case 'running':
      return (
        <Loader2 className="w-3 h-3 text-accent motion-safe:animate-spin" aria-hidden="true" />
      );
    case 'done':
      return <Check className="w-3 h-3 text-success" aria-hidden="true" />;
    case 'failed':
      return <X className="w-3 h-3 text-danger" aria-hidden="true" />;
    default:
      return assertNever(status);
  }
}
