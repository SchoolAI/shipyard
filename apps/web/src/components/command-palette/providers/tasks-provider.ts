import { useTaskStore } from '../../../stores/task-store';
import { fuzzyScore } from '../../../utils/fuzzy-match';
import { statusDotColor } from '../../../utils/task-status';
import type { CommandContext, CommandItem, CommandProvider } from '../types';

export function createTasksProvider(close: () => void): CommandProvider {
  return (context: CommandContext): CommandItem[] => {
    const { tasks, setActiveTask } = useTaskStore.getState();

    return tasks
      .map((task) => {
        const score = context.query ? fuzzyScore(context.query, task.title) : 0;

        if (context.query && score < 0) return null;

        const item: CommandItem = {
          id: `task:${task.id}`,
          kind: 'task',
          label: task.title,
          keywords: [task.status, task.id],
          score,
          statusColor: statusDotColor(task.agent),
          group: 'Tasks',
          onSelect: () => {
            setActiveTask(task.id);
            close();
          },
        };

        return item;
      })
      .filter((item): item is CommandItem => item !== null)
      .sort((a, b) => b.score - a.score);
  };
}
