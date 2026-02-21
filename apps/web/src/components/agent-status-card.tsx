import { Button } from '@heroui/react';
import { AlertCircle, Loader2, Square, X } from 'lucide-react';
import { assertNever } from '../utils/assert-never';

export interface AgentStatusCardProps {
  status: 'running' | 'failed';
  modelName?: string;
  errorMessage?: string;
  onStop?: () => void;
  onDismiss?: () => void;
  isStopping?: boolean;
}

function deriveBorderColor(status: 'running' | 'failed'): string {
  switch (status) {
    case 'running':
      return 'border-l-accent';
    case 'failed':
      return 'border-l-danger';
    default:
      return assertNever(status);
  }
}

export function AgentStatusCard({
  status,
  modelName,
  errorMessage,
  onStop,
  onDismiss,
  isStopping,
}: AgentStatusCardProps) {
  const borderColor = deriveBorderColor(status);

  return (
    <div
      role="status"
      aria-label={status === 'running' ? 'Agent working' : 'Agent failed'}
      aria-live="polite"
      className={`border-l-3 ${borderColor} bg-surface rounded-xl border border-separator px-3 py-2.5 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {status === 'running' ? (
            <Loader2
              className="w-3.5 h-3.5 text-accent motion-safe:animate-spin shrink-0"
              aria-hidden="true"
            />
          ) : (
            <AlertCircle className="w-3.5 h-3.5 text-danger shrink-0" aria-hidden="true" />
          )}
          <span className="text-sm text-foreground font-medium">
            {status === 'running' ? 'Agent working...' : 'Agent failed'}
          </span>
          {modelName && <span className="text-xs text-muted truncate">{modelName}</span>}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {status === 'running' && onStop && (
            <Button
              variant="ghost"
              size="sm"
              onPress={onStop}
              isDisabled={isStopping}
              className="text-xs text-danger hover:text-danger h-6 min-w-11 min-h-11 sm:min-w-8 sm:min-h-8 gap-1"
            >
              <Square className="w-3 h-3" aria-hidden="true" />
              {isStopping ? 'Stopping...' : 'Stop'}
            </Button>
          )}
          {status !== 'running' && onDismiss && (
            <Button
              isIconOnly
              variant="ghost"
              size="sm"
              onPress={onDismiss}
              aria-label="Dismiss agent status"
              className="text-muted/50 hover:text-muted min-w-11 min-h-11 sm:min-w-8 sm:min-h-8 w-8 h-8"
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </div>

      {status === 'failed' && errorMessage && (
        <div className="flex items-center gap-1.5 mt-1.5">
          <AlertCircle className="w-3 h-3 text-danger shrink-0" aria-hidden="true" />
          <span className="text-xs text-danger">{errorMessage}</span>
        </div>
      )}
    </div>
  );
}
