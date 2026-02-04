import { Alert, Link, Spinner } from '@heroui/react';
import type { TaskId } from '@shipyard/loro-schema';
import { AlertCircle, CheckCircle2, ExternalLink, Loader2, XCircle } from 'lucide-react';
import { getTaskRoute } from '@/constants/routes';
import { type SpawnPhase, useSpawnStatus } from '@/hooks/use-spawn-status';

interface SpawnStatusAlertProps {
  taskId: TaskId;
  /** The spawn request ID to track status */
  requestId: string | null;
}

interface TaskCreatedAlertProps {
  taskId: TaskId;
}

type AlertStatus = 'default' | 'accent' | 'success' | 'warning' | 'danger';

interface StatusConfig {
  alertStatus: AlertStatus;
  icon: React.ReactNode;
  title: string;
  description: string;
  borderClass: string;
  shadowClass: string;
}

function getStatusConfig(
  phase: SpawnPhase,
  pid?: number,
  exitCode?: number,
  error?: string
): StatusConfig {
  switch (phase) {
    case 'idle':
    case 'requested':
      return {
        alertStatus: 'accent',
        icon: <Loader2 className="w-5 h-5 text-accent animate-spin" />,
        title: 'Starting agent...',
        description: 'Waiting for agent to initialize...',
        borderClass: 'border-accent/30',
        shadowClass: 'shadow-accent/10',
      };
    case 'started':
      return {
        alertStatus: 'success',
        icon: <CheckCircle2 className="w-5 h-5 text-success animate-in spin-in-180 duration-500" />,
        title: 'Agent launched!',
        description: `Running with PID ${pid}`,
        borderClass: 'border-success/30',
        shadowClass: 'shadow-success/10',
      };
    case 'completed':
      if (exitCode === 0) {
        return {
          alertStatus: 'success',
          icon: (
            <CheckCircle2 className="w-5 h-5 text-success animate-in spin-in-180 duration-500" />
          ),
          title: 'Agent completed',
          description: 'Agent finished successfully',
          borderClass: 'border-success/30',
          shadowClass: 'shadow-success/10',
        };
      }
      return {
        alertStatus: 'warning',
        icon: <AlertCircle className="w-5 h-5 text-warning" />,
        title: 'Agent exited',
        description: `Process exited with code ${exitCode}`,
        borderClass: 'border-warning/30',
        shadowClass: 'shadow-warning/10',
      };
    case 'failed':
      return {
        alertStatus: 'danger',
        icon: <XCircle className="w-5 h-5 text-danger" />,
        title: 'Agent failed to start',
        description: error || 'Unknown error occurred',
        borderClass: 'border-danger/30',
        shadowClass: 'shadow-danger/10',
      };
    default:
      return {
        alertStatus: 'default',
        icon: <Spinner size="sm" />,
        title: 'Processing...',
        description: 'Please wait...',
        borderClass: 'border-default/30',
        shadowClass: 'shadow-default/10',
      };
  }
}

/**
 * Alert component that shows real-time spawn status updates.
 * Displays loading, success, or error states based on spawn events.
 */
export function SpawnStatusAlert({ taskId, requestId }: SpawnStatusAlertProps) {
  const spawnStatus = useSpawnStatus(taskId, requestId);
  const config = getStatusConfig(
    spawnStatus.phase,
    spawnStatus.pid,
    spawnStatus.exitCode,
    spawnStatus.error
  );

  return (
    <div className="animate-in zoom-in-95 fade-in duration-300">
      <Alert
        status={config.alertStatus}
        className={`border-2 ${config.borderClass} shadow-lg ${config.shadowClass}`}
      >
        <Alert.Indicator>{config.icon}</Alert.Indicator>
        <Alert.Content>
          <Alert.Title className="text-lg font-semibold">{config.title}</Alert.Title>
          <Alert.Description className="text-muted-foreground">
            {config.description}
          </Alert.Description>

          <div className="mt-2">
            <Link
              href={`${window.location.origin}${getTaskRoute(taskId)}`}
              target="_blank"
              className="text-sm text-accent hover:text-accent/80 underline-offset-2 hover:underline"
            >
              Open task
              <Link.Icon className="ml-1 size-3">
                <ExternalLink />
              </Link.Icon>
            </Link>
          </div>
        </Alert.Content>
      </Alert>
    </div>
  );
}

/**
 * Alert shown when task is created but no agent was launched
 * (daemon not available).
 */
export function TaskCreatedAlert({ taskId }: TaskCreatedAlertProps) {
  return (
    <div className="animate-in zoom-in-95 fade-in duration-300">
      <Alert status="success" className="border-2 border-success/30 shadow-lg shadow-success/10">
        <Alert.Indicator>
          <CheckCircle2 className="w-5 h-5 text-success animate-in spin-in-180 duration-500" />
        </Alert.Indicator>
        <Alert.Content>
          <Alert.Title className="text-lg font-semibold">Task created!</Alert.Title>
          <Alert.Description className="text-muted-foreground">
            Your task is ready. Connect the server to launch an agent.
          </Alert.Description>
          <div className="mt-2">
            <Link
              href={`${window.location.origin}${getTaskRoute(taskId)}`}
              target="_blank"
              className="text-sm text-accent hover:text-accent/80 underline-offset-2 hover:underline"
            >
              Open task
              <Link.Icon className="ml-1 size-3">
                <ExternalLink />
              </Link.Icon>
            </Link>
          </div>
        </Alert.Content>
      </Alert>
    </div>
  );
}

// Legacy export for backwards compatibility (deprecated)
// TODO: Remove this after migrating all usages
export function SuccessAlert({
  taskId,
  variant,
  requestId,
}: {
  taskId: TaskId;
  variant: 'agent-spawned' | 'task-created';
  requestId?: string | null;
}) {
  if (variant === 'task-created') {
    return <TaskCreatedAlert taskId={taskId} />;
  }
  return <SpawnStatusAlert taskId={taskId} requestId={requestId ?? null} />;
}
