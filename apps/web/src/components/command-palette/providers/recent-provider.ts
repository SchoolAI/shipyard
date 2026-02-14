import { useFrecencyStore } from '../../../stores/frecency-store';
import type { CommandContext, CommandItem, CommandProvider } from '../types';

const MAX_RECENT = 5;

export function createRecentProvider(
  otherProviders: CommandProvider[],
  _close: () => void
): CommandProvider {
  return (context: CommandContext): CommandItem[] => {
    if (context.query) return [];

    const emptyContext: CommandContext = {
      activeTaskId: context.activeTaskId,
      query: '',
    };

    const allItems: CommandItem[] = [];
    for (const provider of otherProviders) {
      const items = provider(emptyContext);
      allItems.push(...items);
    }

    const { getScore } = useFrecencyStore.getState();

    return allItems
      .map((item) => ({
        ...item,
        score: getScore(item.id),
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_RECENT)
      .map((item) => ({
        ...item,
        id: `recent:${item.id}`,
        kind: 'recent' as const,
        group: 'Recent',
      }));
  };
}
