import type { A2ATaskState, TaskIndexEntry } from '@shipyard/loro-schema';
import type { LucideIcon } from 'lucide-react';
import { AlertCircle, Ban, CheckCircle2, Circle, Loader, Play } from 'lucide-react';
import { fuzzyScore } from '../../../../utils/fuzzy-match';
import type { CommandContext, CommandItem, CommandProvider } from '../types';

interface StatusOption {
  status: A2ATaskState;
  label: string;
  icon: LucideIcon;
  statusColor: string;
  keywords: string[];
}

const STATUS_OPTIONS: StatusOption[] = [
  {
    status: 'submitted',
    label: 'Set Submitted',
    icon: Circle,
    statusColor: 'bg-muted/40',
    keywords: ['submitted', 'new', 'queue'],
  },
  {
    status: 'working',
    label: 'Set Working',
    icon: Play,
    statusColor: 'bg-warning',
    keywords: ['working', 'active', 'run'],
  },
  {
    status: 'input-required',
    label: 'Set Input Required',
    icon: Loader,
    statusColor: 'bg-warning',
    keywords: ['input', 'waiting', 'blocked'],
  },
  {
    status: 'completed',
    label: 'Set Completed',
    icon: CheckCircle2,
    statusColor: 'bg-success',
    keywords: ['completed', 'done', 'finish'],
  },
  {
    status: 'canceled',
    label: 'Set Canceled',
    icon: Ban,
    statusColor: 'bg-muted/40',
    keywords: ['canceled', 'cancel', 'stop'],
  },
  {
    status: 'failed',
    label: 'Set Failed',
    icon: AlertCircle,
    statusColor: 'bg-danger',
    keywords: ['failed', 'error', 'broken'],
  },
];

const VALID_TRANSITIONS: Record<A2ATaskState, readonly A2ATaskState[]> = {
  submitted: ['canceled'],
  working: ['canceled'],
  'input-required': ['canceled'],
  completed: [],
  canceled: [],
  failed: ['submitted'],
};

export function getValidTransitions(currentStatus: A2ATaskState): readonly A2ATaskState[] {
  return VALID_TRANSITIONS[currentStatus] ?? [];
}

export function createTaskStatusProvider(
  close: () => void,
  getTaskIndex: () => Record<string, TaskIndexEntry>,
  onUpdateStatus: (taskId: string, status: A2ATaskState) => void
): CommandProvider {
  return (context: CommandContext): CommandItem[] => {
    const { activeTaskId } = context;
    if (!activeTaskId) return [];

    const taskIndex = getTaskIndex();
    const activeEntry = taskIndex[activeTaskId];
    if (!activeEntry) return [];

    const allowed = getValidTransitions(activeEntry.status);

    return STATUS_OPTIONS.filter((option) => allowed.includes(option.status))
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
          subtitle: `Change "${activeEntry.title}" to ${option.status}`,
          group: 'Change Status',
          onSelect: () => {
            onUpdateStatus(activeTaskId, option.status);
            close();
          },
        };

        return item;
      })
      .filter((item): item is CommandItem => item !== null);
  };
}
