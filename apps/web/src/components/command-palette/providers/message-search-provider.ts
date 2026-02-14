import { MessageSquare } from 'lucide-react';
import { useMessageStore } from '../../../stores/message-store';
import { useTaskStore } from '../../../stores/task-store';
import type { MessageData, TaskData } from '../../../stores/types';
import { fuzzyScore } from '../../../utils/fuzzy-match';
import type { CommandContext, CommandItem, CommandProvider } from '../types';

const MAX_RESULTS = 10;
const MIN_QUERY_LENGTH = 2;
const SNIPPET_LENGTH = 80;

function createSnippet(content: string, query: string): string {
  const lowerContent = content.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const index = lowerContent.indexOf(lowerQuery);

  if (index < 0) {
    return content.length > SNIPPET_LENGTH ? `${content.slice(0, SNIPPET_LENGTH)}...` : content;
  }

  const start = Math.max(0, index - 20);
  const end = Math.min(content.length, index + query.length + SNIPPET_LENGTH - 20);
  const prefix = start > 0 ? '...' : '';
  const suffix = end < content.length ? '...' : '';

  return `${prefix}${content.slice(start, end)}${suffix}`;
}

function matchMessage(
  message: MessageData,
  query: string,
  task: TaskData,
  taskId: string,
  close: () => void,
  setActiveTask: (id: string | null) => void
): CommandItem | null {
  const score = fuzzyScore(query, message.content);
  if (score < 0) return null;

  return {
    id: `message:${message.id}`,
    kind: 'message',
    label: createSnippet(message.content, query),
    icon: MessageSquare,
    keywords: [task.title, message.role],
    score,
    subtitle: task.title,
    group: 'Messages',
    onSelect: () => {
      setActiveTask(taskId);
      close();
    },
  };
}

function collectMatchesForTask(
  messages: MessageData[],
  query: string,
  task: TaskData,
  taskId: string,
  close: () => void,
  setActiveTask: (id: string | null) => void,
  limit: number
): CommandItem[] {
  const items: CommandItem[] = [];
  for (const message of messages) {
    if (items.length >= limit) break;
    const item = matchMessage(message, query, task, taskId, close, setActiveTask);
    if (item) items.push(item);
  }
  return items;
}

export function createMessageSearchProvider(close: () => void): CommandProvider {
  return (context: CommandContext): CommandItem[] => {
    if (context.query.length < MIN_QUERY_LENGTH) return [];

    const messagesByTask = useMessageStore.getState().messagesByTask;
    const { tasks, setActiveTask } = useTaskStore.getState();
    const taskMap = new Map(tasks.map((t) => [t.id, t]));

    const results: CommandItem[] = [];

    for (const [taskId, messages] of Object.entries(messagesByTask)) {
      if (results.length >= MAX_RESULTS) break;
      const task = taskMap.get(taskId);
      if (!task) continue;

      const remaining = MAX_RESULTS - results.length;
      const items = collectMatchesForTask(
        messages,
        context.query,
        task,
        taskId,
        close,
        setActiveTask,
        remaining
      );
      results.push(...items);
    }

    return results.sort((a, b) => b.score - a.score).slice(0, MAX_RESULTS);
  };
}
