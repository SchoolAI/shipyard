import { Chip } from '@heroui/react';
import { getPlanEvents, YDOC_KEYS } from '@peer-plan/schema';
import { Circle, Clock, Pause, Zap } from 'lucide-react';
import { useEffect, useState } from 'react';
import type * as Y from 'yjs';

interface AgentStatusBadgeProps {
  ydoc: Y.Doc;
}

export function AgentStatusBadge({ ydoc }: AgentStatusBadgeProps) {
  const [status, setStatus] = useState<{
    status: 'working' | 'blocked' | 'idle' | 'waiting';
    message?: string;
  } | null>(null);

  useEffect(() => {
    let mounted = true;

    const update = () => {
      if (!mounted) return; // Guard against unmounted component

      const events = getPlanEvents(ydoc);

      // Find most recent status event by array position (Yjs guarantees causal ordering)
      // Last event in array is actually most recent; wall-clock timestamps can be out of order in P2P
      const statusEvents = events.filter(
        (e) => e.type === 'agent_activity' && e.data.activityType === 'status'
      );

      if (statusEvents.length > 0) {
        // Use array position, not timestamp sorting
        const latest = statusEvents[statusEvents.length - 1];
        // TypeScript knows latest is agent_activity with activityType='status' from filter
        if (latest && latest.type === 'agent_activity' && latest.data.activityType === 'status') {
          setStatus({
            status: latest.data.status,
            message: latest.data.message,
          });
        }
      } else {
        setStatus(null);
      }
    };

    const eventsArray = ydoc.getArray(YDOC_KEYS.EVENTS);
    update();
    eventsArray.observe(update);

    return () => {
      mounted = false; // Set before unobserve to prevent race conditions
      eventsArray.unobserve(update);
    };
  }, [ydoc]);

  if (!status) return null;

  const config = {
    working: { color: 'accent' as const, icon: Zap, label: 'Working' },
    blocked: { color: 'danger' as const, icon: Pause, label: 'Blocked' },
    waiting: { color: 'warning' as const, icon: Clock, label: 'Waiting' },
    idle: { color: 'default' as const, icon: Circle, label: 'Idle' },
  };

  const { color, icon: Icon, label } = config[status.status];

  return (
    <Chip color={color} variant="soft">
      <div className="flex items-center gap-1">
        <Icon className="w-3 h-3" />
        <span>Agent: {label}</span>
      </div>
    </Chip>
  );
}
