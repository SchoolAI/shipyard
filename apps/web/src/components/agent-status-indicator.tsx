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

function getStatusConfig(
  phase: SpawnPhase,
  pid?: number,
  exitCode?: number,
  error?: string
): StatusConfig {
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

    case 'completed':
      if (exitCode === 0) {
        return {
          icon: <CheckCircle className="size-3.5" />,
          label: 'Completed',
          color: 'success',
          description: 'Agent completed successfully',
        };
      }
      return {
        icon: <AlertCircle className="size-3.5" />,
        label: `Exited (${exitCode})`,
        color: 'warning',
        description: `Agent exited with code ${exitCode}`,
      };

    case 'failed':
      return {
        icon: <XCircle className="size-3.5" />,
        label: 'Failed',
        color: 'danger',
        description: error || 'Agent spawn failed',
      };

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
  const config = getStatusConfig(status.phase, status.pid, status.exitCode, status.error);

  // Don't show anything if no agent has been spawned
  if (status.phase === 'idle') {
    return null;
  }

  if (variant === 'compact') {
    return (
      <Tooltip>
        <Tooltip.Trigger>
          <div className="flex items-center justify-center size-6">
            {config.icon || <Rocket className="size-3.5" />}
          </div>
        </Tooltip.Trigger>
        <Tooltip.Content>
          <div className="text-sm">
            <p className="font-medium">{config.label}</p>
            <p className="text-muted-foreground">{config.description}</p>
          </div>
        </Tooltip.Content>
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
      <Tooltip.Content>
        <p className="text-sm">{config.description}</p>
      </Tooltip.Content>
    </Tooltip>
  );
}
