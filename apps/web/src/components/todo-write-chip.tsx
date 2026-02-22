import type { RawTodoItem } from '@shipyard/loro-schema';
import { ListChecks } from 'lucide-react';
import { useMemo } from 'react';
import { useUIStore } from '../stores';
import type { GroupedBlock } from '../utils/group-content-blocks';

export function TodoWriteChip({ group }: { group: GroupedBlock & { kind: 'todo_write' } }) {
  const todos: RawTodoItem[] = group.todos;
  const completed = useMemo(() => todos.filter((t) => t.status === 'completed').length, [todos]);
  const total = todos.length;
  const allDone = completed === total && total > 0;

  return (
    <button
      type="button"
      onClick={() => useUIStore.getState().setActiveSidePanel('tasks')}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs cursor-pointer transition-colors ${
        allDone
          ? 'bg-success/10 text-success hover:bg-success/20'
          : 'bg-default/50 text-muted hover:bg-default/70 hover:text-foreground'
      }`}
      aria-label={`Updated tasks: ${completed} of ${total} complete. Click to open tasks panel.`}
    >
      <ListChecks className="w-3 h-3" />
      {allDone ? `All ${total} tasks complete` : `Updated tasks ${completed}/${total}`}
      {!allDone && (
        <span className="inline-block w-8 h-1 rounded-full bg-separator overflow-hidden">
          <span
            className="block h-full rounded-full bg-secondary"
            style={{ width: `${total > 0 ? (completed / total) * 100 : 0}%` }}
          />
        </span>
      )}
    </button>
  );
}
