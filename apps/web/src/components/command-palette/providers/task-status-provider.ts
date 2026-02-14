import type { LucideIcon } from 'lucide-react';
import { AlertCircle, CheckCircle2, Circle, Play } from 'lucide-react';
import { useTaskStore } from '../../../stores/task-store';
import type { TaskStatus } from '../../../stores/types';
import { fuzzyScore } from '../../../utils/fuzzy-match';
import type { CommandContext, CommandItem, CommandProvider } from '../types';

interface StatusOption {
  status: TaskStatus;
  label: string;
  icon: LucideIcon;
  statusColor: string;
  keywords: string[];
}

const STATUS_OPTIONS: StatusOption[] = [
  {
    status: 'pending',
    label: 'Set Pending',
    icon: Circle,
    statusColor: 'bg-muted/40',
    keywords: ['pending', 'wait', 'queue'],
  },
  {
    status: 'active',
    label: 'Set Active',
    icon: Play,
    statusColor: 'bg-warning',
    keywords: ['active', 'start', 'run'],
  },
  {
    status: 'completed',
    label: 'Set Completed',
    icon: CheckCircle2,
    statusColor: 'bg-success',
    keywords: ['completed', 'done', 'finish'],
  },
  {
    status: 'error',
    label: 'Set Error',
    icon: AlertCircle,
    statusColor: 'bg-danger',
    keywords: ['error', 'fail', 'broken'],
  },
];

export function createTaskStatusProvider(close: () => void): CommandProvider {
  return (context: CommandContext): CommandItem[] => {
    if (!context.activeTaskId) return [];

    const { tasks, updateTask } = useTaskStore.getState();
    const activeTask = tasks.find((t) => t.id === context.activeTaskId);
    if (!activeTask) return [];

    return STATUS_OPTIONS.filter((option) => option.status !== activeTask.status)
      .map((option) => {
        const score = context.query ? fuzzyScore(context.query, option.label) : 0;

        if (context.query && score < 0) {
          const keywordMatch = option.keywords.some((kw) => fuzzyScore(context.query, kw) >= 0);
          if (!keywordMatch) return null;
        }

        const item: CommandItem = {
          id: `status:${option.status}`,
          kind: 'task-status',
          label: option.label,
          icon: option.icon,
          keywords: option.keywords,
          score: Math.max(score, 0),
          statusColor: option.statusColor,
          subtitle: `Change "${activeTask.title}" to ${option.status}`,
          group: 'Change Status',
          onSelect: () => {
            updateTask(activeTask.id, { status: option.status });
            close();
          },
        };

        return item;
      })
      .filter((item): item is CommandItem => item !== null);
  };
}
