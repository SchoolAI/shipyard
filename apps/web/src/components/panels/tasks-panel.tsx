export { TasksPanelContent };

import type { SessionEntry, TodoItem } from '@shipyard/loro-schema';
import { Check, ChevronDown, ChevronRight, Circle, ListChecks, Loader2 } from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { ProgressRing } from '../progress-ring';

function formatElapsed(ms: number): string {
  if (ms < 1000) return '<1s';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center flex-1 gap-3 px-4">
      <ListChecks className="w-8 h-8 text-muted" />
      <p className="text-sm text-muted">No tasks yet</p>
      <p className="text-xs text-muted/60">Tasks will appear here as the agent works</p>
    </div>
  );
}

function Section({
  label,
  count,
  color,
  collapsible,
  collapsed,
  onToggle,
  children,
}: {
  label: string;
  count: number;
  color: string;
  collapsible?: boolean;
  collapsed?: boolean;
  onToggle?: () => void;
  children: ReactNode;
}) {
  const Chevron = collapsed ? ChevronRight : ChevronDown;
  return (
    <div className="py-1">
      <button
        type="button"
        className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium w-full text-left"
        onClick={collapsible ? onToggle : undefined}
        disabled={!collapsible}
      >
        {collapsible && <Chevron className="w-3 h-3 text-muted" />}
        <span className={color}>{label}</span>
        <span className="text-muted">({count})</span>
      </button>
      {!collapsed && children}
    </div>
  );
}

function TodoItemRow({ item }: { item: TodoItem }) {
  const elapsed = useMemo(() => {
    if (item.status === 'completed' && item.startedAt && item.completedAt) {
      return formatElapsed(item.completedAt - item.startedAt);
    }
    if (item.status === 'in_progress' && item.startedAt) {
      return formatElapsed(Date.now() - item.startedAt);
    }
    return null;
  }, [item.status, item.startedAt, item.completedAt]);

  return (
    <div className="flex items-start gap-2.5 px-4 py-2 hover:bg-default/30 transition-colors">
      <div className="mt-0.5 shrink-0">
        {item.status === 'completed' ? (
          <Check className="w-3.5 h-3.5 text-success" />
        ) : item.status === 'in_progress' ? (
          <Loader2 className="w-3.5 h-3.5 text-secondary motion-safe:animate-spin" />
        ) : (
          <Circle className="w-3.5 h-3.5 text-muted" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <span
          className={`text-sm ${item.status === 'completed' ? 'text-muted line-through' : 'text-foreground'}`}
        >
          {item.content}
        </span>
        {item.status === 'in_progress' && item.activeForm && (
          <p className="text-xs text-secondary italic mt-0.5">{item.activeForm}</p>
        )}
      </div>
      {elapsed && <span className="text-xs font-mono text-muted shrink-0">{elapsed}</span>}
    </div>
  );
}

function TasksPanelContent({
  todoItems,
  sessions,
}: {
  todoItems: TodoItem[];
  sessions: SessionEntry[];
}) {
  const [showCompleted, setShowCompleted] = useState(true);
  const [, setTick] = useState(0);

  const hasInProgress = todoItems.some((i) => i.status === 'in_progress');
  useEffect(() => {
    if (!hasInProgress) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [hasInProgress]);

  const { inProgress, pending, completed } = useMemo(
    () => ({
      inProgress: todoItems.filter((i) => i.status === 'in_progress'),
      pending: todoItems.filter((i) => i.status === 'pending'),
      completed: todoItems.filter((i) => i.status === 'completed'),
    }),
    [todoItems]
  );

  const total = todoItems.length;
  const completedCount = completed.length;

  if (total === 0) return <EmptyState />;

  const sessionStartedAt = sessions[sessions.length - 1]?.createdAt ?? null;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-separator/30">
        <ProgressRing completed={completedCount} total={total} size={32} />
        <div>
          <p className="text-sm font-medium text-foreground">
            {completedCount} of {total} tasks
          </p>
          {sessionStartedAt && (
            <p className="text-xs font-mono text-muted">
              {formatElapsed(Date.now() - sessionStartedAt)}
            </p>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {inProgress.length > 0 && (
          <Section label="In Progress" count={inProgress.length} color="text-secondary">
            {inProgress.map((item, i) => (
              <TodoItemRow key={`ip-${i}`} item={item} />
            ))}
          </Section>
        )}
        {pending.length > 0 && (
          <Section label="Pending" count={pending.length} color="text-muted">
            {pending.map((item, i) => (
              <TodoItemRow key={`p-${i}`} item={item} />
            ))}
          </Section>
        )}
        {completed.length > 0 && (
          <Section
            label="Completed"
            count={completed.length}
            color="text-success"
            collapsible
            collapsed={!showCompleted}
            onToggle={() => setShowCompleted((prev) => !prev)}
          >
            {completed.map((item, i) => (
              <TodoItemRow key={`c-${i}`} item={item} />
            ))}
          </Section>
        )}
      </div>
    </div>
  );
}
