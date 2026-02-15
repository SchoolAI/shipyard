import type { TaskIndexEntry } from '@shipyard/loro-schema';
import { useTaskStore } from '../../../stores/task-store';
import { fuzzyScore } from '../../../utils/fuzzy-match';
import { statusDotColor } from '../../../utils/task-status';
import type { CommandContext, CommandItem, CommandProvider } from '../types';

export function createTasksProvider(
  close: () => void,
  getTaskIndex: () => Record<string, TaskIndexEntry>
): CommandProvider {
  return (context: CommandContext): CommandItem[] => {
    const { setActiveTask } = useTaskStore.getState();
    const taskIndex = getTaskIndex();

    return Object.values(taskIndex)
      .map((entry) => {
        const score = context.query ? fuzzyScore(context.query, entry.title) : 0;

        if (context.query && score < 0) return null;

        const item: CommandItem = {
          id: `task:${entry.taskId}`,
          kind: 'task',
          label: entry.title,
          keywords: [entry.status, entry.taskId],
          score,
          statusColor: statusDotColor(entry.status),
          group: 'Tasks',
          onSelect: () => {
            setActiveTask(entry.taskId);
            close();
          },
        };

        return item;
      })
      .filter((item): item is CommandItem => item !== null)
      .sort((a, b) => b.score - a.score);
  };
}
