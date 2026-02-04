import { Chip } from '@heroui/react';
import type { TaskId } from '@shipyard/loro-schema';
import { AlertOctagon, MessageSquare } from 'lucide-react';
import { useMemo } from 'react';
import { useTaskInputRequests, useTaskMeta } from '@/loro/selectors/task-selectors';

export type SwitchTabEventDetail = {
  tab: 'plan' | 'activity' | 'deliverables' | 'changes';
};

interface AgentRequestsBadgeProps {
  taskId: TaskId;
  isSnapshot?: boolean;
}

export function AgentRequestsBadge({ taskId, isSnapshot = false }: AgentRequestsBadgeProps) {
  const inputRequests = useTaskInputRequests(taskId);
  const meta = useTaskMeta(taskId);

  const counts = useMemo(() => {
    if (!meta || meta.status === 'completed' || meta.archivedAt || isSnapshot) {
      return { input: 0, blocker: 0 };
    }

    const pendingRequests = inputRequests.filter((r) => r.status === 'pending');

    const blockerCount = pendingRequests.filter((r) => r.isBlocker).length;
    const normalCount = pendingRequests.filter((r) => !r.isBlocker).length;

    return { input: normalCount, blocker: blockerCount };
  }, [inputRequests, meta, isSnapshot]);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();

    const event = new CustomEvent<SwitchTabEventDetail>('switch-plan-tab', {
      detail: { tab: 'activity' },
      bubbles: true,
    });
    document.dispatchEvent(event);
  };

  if (counts.blocker > 0) {
    return (
      <button
        type="button"
        onClick={handleClick}
        className="cursor-pointer hover:opacity-80 transition-opacity focus:outline-none focus:ring-2 focus:ring-danger rounded-full"
      >
        <Chip color="danger" variant="soft">
          <div className="flex items-center gap-1">
            <AlertOctagon className="w-3 h-3" />
            <span>Agent: Blocked{counts.blocker > 1 ? ` (${counts.blocker})` : ''}</span>
          </div>
        </Chip>
      </button>
    );
  }

  if (counts.input > 0) {
    return (
      <button
        type="button"
        onClick={handleClick}
        className="cursor-pointer hover:opacity-80 transition-opacity focus:outline-none focus:ring-2 focus:ring-accent rounded-full"
      >
        <Chip color="accent" variant="soft">
          <div className="flex items-center gap-1">
            <MessageSquare className="w-3 h-3" />
            <span>Agent: Needs Input{counts.input > 1 ? ` (${counts.input})` : ''}</span>
          </div>
        </Chip>
      </button>
    );
  }

  return null;
}
