import { Chip, Spinner, Tooltip } from '@heroui/react';
import type { TaskId } from '@shipyard/loro-schema';
import { AlertCircle, CheckCircle, Play, Rocket, XCircle } from 'lucide-react';
import { type SpawnPhase, useLatestSpawnStatus } from '@/hooks/use-spawn-status';

interface AgentStatusIndicatorProps {
  taskId: TaskId;
  /** Compact mode shows just an icon, full mode shows text */
  variant?: 'compact' | 'full';
}

interface StatusConfig {
  icon: React.ReactNode;
  label: string;
  color: 'default' | 'accent' | 'success' | 'warning' | 'danger';
  description: string;
}

interface GetStatusConfigOptions {
  phase: SpawnPhase;
  pid?: number;
  exitCode?: number;
  signal?: string | null;
  stderr?: string | null;
  error?: string;
}

function getStatusConfig({
  phase,
  pid,
  exitCode,
  signal,
  stderr,
  error,
}: GetStatusConfigOptions): StatusConfig {
  switch (phase) {
    case 'idle':
      return {
        icon: null,
        label: 'No agent',
        color: 'default',
        description: 'No agent has been spawned for this task',
      };

    case 'requested':
      return {
        icon: <Spinner size="sm" />,
        label: 'Requesting...',
        color: 'accent',
        description: 'Agent spawn has been requested',
      };

    case 'started':
      return {
        icon: <Play className="size-3.5" />,
        label: `Running (PID: ${pid})`,
        color: 'success',
        description: `Agent is running with process ID ${pid}`,
      };

    case 'completed': {
      if (exitCode === 0) {
        return {
          icon: <CheckCircle className="size-3.5" />,
          label: 'Completed',
          color: 'success',
          description: 'Agent completed successfully',
        };
      }
      // Build a detailed description for non-zero exit
      let description = `Agent exited with code ${exitCode}`;
      if (signal) {
        description += ` (signal: ${signal})`;
      }
      if (stderr) {
        description += `\n\nStderr:\n${stderr}`;
      }
      return {
        icon: <AlertCircle className="size-3.5" />,
        label: `Exited (${exitCode})`,
        color: 'warning',
        description,
      };
    }

    case 'failed': {
      let description = error || 'Agent spawn failed';
      if (stderr) {
        description += `\n\nStderr:\n${stderr}`;
      }
      return {
        icon: <XCircle className="size-3.5" />,
        label: 'Failed',
        color: 'danger',
        description,
      };
    }

    default: {
      const _exhaustive: never = phase;
      void _exhaustive;
      return {
        icon: null,
        label: 'Unknown',
        color: 'default',
        description: 'Unknown status',
      };
    }
  }
}

export function AgentStatusIndicator({ taskId, variant = 'full' }: AgentStatusIndicatorProps) {
  const status = useLatestSpawnStatus(taskId);
  const config = getStatusConfig({
    phase: status.phase,
    pid: status.pid,
    exitCode: status.exitCode,
    signal: status.signal,
    stderr: status.stderr,
    error: status.error,
  });

  // Don't show anything if no agent has been spawned
  if (status.phase === 'idle') {
    return null;
  }

  // Check if description has stderr (contains newlines)
  const hasStderr = config.description.includes('\n');

  // Render tooltip content with proper formatting for stderr
  const tooltipContent = hasStderr ? (
    <div className="max-w-md text-sm">
      <p className="font-medium">{config.label}</p>
      <pre className="mt-2 whitespace-pre-wrap break-words text-muted-foreground font-mono text-xs max-h-48 overflow-auto">
        {config.description}
      </pre>
    </div>
  ) : (
    <div className="text-sm">
      <p className="font-medium">{config.label}</p>
      <p className="text-muted-foreground">{config.description}</p>
    </div>
  );

  if (variant === 'compact') {
    return (
      <Tooltip>
        <Tooltip.Trigger>
          <div className="flex items-center justify-center size-6">
            {config.icon || <Rocket className="size-3.5" />}
          </div>
        </Tooltip.Trigger>
        <Tooltip.Content>{tooltipContent}</Tooltip.Content>
      </Tooltip>
    );
  }

  return (
    <Tooltip>
      <Tooltip.Trigger>
        <Chip color={config.color} variant="soft" className="gap-1">
          {config.icon}
          {config.label}
        </Chip>
      </Tooltip.Trigger>
      <Tooltip.Content>{tooltipContent}</Tooltip.Content>
    </Tooltip>
  );
}
