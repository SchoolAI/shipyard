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
    const update = () => {
      const events = getPlanEvents(ydoc);

      // Find most recent agent_activity with activityType='status'
      const statusEvents = events
        .filter((e) => e.type === 'agent_activity' && e.data.activityType === 'status')
        .sort((a, b) => b.timestamp - a.timestamp);

      if (statusEvents.length > 0) {
        const latest = statusEvents[0];
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
    return () => eventsArray.unobserve(update);
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
    <Chip color={color} variant="soft" size="sm">
      <div className="flex items-center gap-1">
        <Icon className="w-3 h-3" />
        <span>Agent: {label}</span>
      </div>
    </Chip>
  );
}
