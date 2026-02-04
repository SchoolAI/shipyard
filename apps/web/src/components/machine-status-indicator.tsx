import { Chip, Tooltip } from '@heroui/react';
import { AlertTriangle, Clock } from 'lucide-react';
import { formatRelativeTime } from '@/utils/formatters';
import type { ChangeSnapshot } from './changes-types';

const STALE_THRESHOLD_MS = 30_000;

export interface MachineStatusIndicatorProps {
  snapshot: ChangeSnapshot;
}

/**
 * Displays machine sync status based on connection state and recency of updates.
 *
 * States:
 * - Live: Connected and recently updated (< 30 seconds)
 * - Stale: Connected but no recent updates (> 30 seconds) - shows warning
 * - Disconnected: Not connected - shows timestamp of last update
 */
export function MachineStatusIndicator({ snapshot }: MachineStatusIndicatorProps) {
  const timeSinceUpdate = Date.now() - snapshot.updatedAt;
  const isStale = snapshot.isLive && timeSinceUpdate > STALE_THRESHOLD_MS;

  // Live and recently updated
  if (snapshot.isLive && !isStale) {
    return (
      <Chip size="sm" color="success" variant="soft">
        Live
      </Chip>
    );
  }

  // Disconnected - show timestamp
  if (!snapshot.isLive) {
    return (
      <Tooltip delay={0}>
        <Tooltip.Trigger>
          <div className="flex items-center gap-1 text-muted-foreground text-xs">
            <Clock className="w-3 h-3" />
            <span>{formatRelativeTime(snapshot.updatedAt)}</span>
          </div>
        </Tooltip.Trigger>
        <Tooltip.Content>Disconnected {formatRelativeTime(snapshot.updatedAt)}</Tooltip.Content>
      </Tooltip>
    );
  }

  // Live but stale - show warning
  return (
    <Tooltip delay={0}>
      <Tooltip.Trigger>
        <div className="flex items-center gap-1 text-warning text-xs">
          <AlertTriangle className="w-3 h-3" />
          <span>Stale</span>
        </div>
      </Tooltip.Trigger>
      <Tooltip.Content>Data may be stale - no recent updates</Tooltip.Content>
    </Tooltip>
  );
}
