import type { TaskIndexEntry } from '@shipyard/loro-schema';
import { MessageSquare } from 'lucide-react';
import { useMessageStore } from '../../../../stores/message-store';
import { useTaskStore } from '../../../../stores/task-store';
import type { MessageData } from '../../../../stores/types';
import { fuzzyScore } from '../../../../utils/fuzzy-match';
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
  taskTitle: string,
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
    keywords: [taskTitle, message.role],
    score,
    subtitle: taskTitle,
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
  taskTitle: string,
  taskId: string,
  close: () => void,
  setActiveTask: (id: string | null) => void,
  limit: number
): CommandItem[] {
  const items: CommandItem[] = [];
  for (const message of messages) {
    if (items.length >= limit) break;
    const item = matchMessage(message, query, taskTitle, taskId, close, setActiveTask);
    if (item) items.push(item);
  }
  return items;
}

export function createMessageSearchProvider(
  close: () => void,
  getTaskIndex?: () => Record<string, TaskIndexEntry>
): CommandProvider {
  return (context: CommandContext): CommandItem[] => {
    if (context.query.length < MIN_QUERY_LENGTH) return [];

    const messagesByTask = useMessageStore.getState().messagesByTask;
    const { setActiveTask } = useTaskStore.getState();
    const taskIndex = getTaskIndex?.() ?? {};

    const results: CommandItem[] = [];

    for (const [taskId, messages] of Object.entries(messagesByTask)) {
      if (results.length >= MAX_RESULTS) break;
      const entry = taskIndex[taskId];
      const taskTitle = entry?.title ?? taskId;

      const remaining = MAX_RESULTS - results.length;
      const items = collectMatchesForTask(
        messages,
        context.query,
        taskTitle,
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
