import { getPlanEvents, type PlanEvent, YDOC_KEYS } from '@peer-plan/schema';
import { useEffect, useState } from 'react';
import type * as Y from 'yjs';
import { ActivityEvent } from '@/components/ActivityEvent';

interface ActivityTimelineProps {
  ydoc: Y.Doc;
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

function groupEventsByDay(events: PlanEvent[]): Record<DayGroup, PlanEvent[]> {
  const groups: Record<DayGroup, PlanEvent[]> = {
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

export function ActivityTimeline({ ydoc }: ActivityTimelineProps) {
  const [events, setEvents] = useState<PlanEvent[]>([]);

  useEffect(() => {
    const eventsArray = ydoc.getArray(YDOC_KEYS.EVENTS);

    const update = () => {
      setEvents(getPlanEvents(ydoc));
    };

    update();
    eventsArray.observe(update);
    return () => eventsArray.unobserve(update);
  }, [ydoc]);

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
              <ActivityEvent key={event.id} event={event} />
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
