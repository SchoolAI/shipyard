import type { TaskEventItem, TaskId } from '@shipyard/loro-schema';
import { useMemo } from 'react';
import { useTaskEvents } from '@/loro/selectors/task-selectors';
import { ActivityEvent } from './activity-event';

interface ActivityTimelineProps {
  taskId: TaskId;
}

type DayGroup = 'Today' | 'Yesterday' | 'This Week' | 'Earlier';

function getDayGroup(timestamp: number): DayGroup {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = todayStart - 86400000;
  const weekStart = todayStart - 6 * 86400000;

  if (timestamp >= todayStart) return 'Today';
  if (timestamp >= yesterdayStart) return 'Yesterday';
  if (timestamp >= weekStart) return 'This Week';
  return 'Earlier';
}

function groupEventsByDay(events: TaskEventItem[]): Record<DayGroup, TaskEventItem[]> {
  const groups: Record<DayGroup, TaskEventItem[]> = {
    Today: [],
    Yesterday: [],
    'This Week': [],
    Earlier: [],
  };

  const sortedEvents = [...events].sort((a, b) => b.timestamp - a.timestamp);

  for (const event of sortedEvents) {
    const group = getDayGroup(event.timestamp);
    groups[group].push(event);
  }

  return groups;
}

function getResolvedRequestIds(events: TaskEventItem[]): Set<string> {
  const resolvedIds = new Set<string>();

  for (const event of events) {
    if (
      event.type === 'input_request_answered' ||
      event.type === 'input_request_declined' ||
      event.type === 'input_request_cancelled'
    ) {
      resolvedIds.add(event.requestId);
    }
  }

  return resolvedIds;
}

function isUnresolvedRequest(event: TaskEventItem, resolvedIds: Set<string>): boolean {
  if (event.type === 'input_request_created') {
    return !resolvedIds.has(event.requestId);
  }
  return false;
}

export function ActivityTimeline({ taskId }: ActivityTimelineProps) {
  const events = useTaskEvents(taskId);

  const resolvedRequestIds = useMemo(() => getResolvedRequestIds(events), [events]);

  const grouped = groupEventsByDay(events);
  const dayOrder: DayGroup[] = ['Today', 'Yesterday', 'This Week', 'Earlier'];
  const nonEmptyGroups = dayOrder.filter((day) => grouped[day].length > 0);

  return (
    <div className="p-4 space-y-6">
      {nonEmptyGroups.map((day) => (
        <div key={day}>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase mb-3">{day}</h3>
          <div className="space-y-2">
            {grouped[day].map((event) => (
              <ActivityEvent
                key={event.id}
                event={event}
                isUnresolved={isUnresolvedRequest(event, resolvedRequestIds)}
              />
            ))}
          </div>
        </div>
      ))}

      {events.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">No activity yet</div>
      )}
    </div>
  );
}
