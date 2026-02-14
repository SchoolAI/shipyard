import type { LucideIcon } from 'lucide-react';

export type CommandItemKind = 'task' | 'action' | 'task-status' | 'message' | 'recent';

export interface CommandItem {
  id: string;
  kind: CommandItemKind;
  label: string;
  icon?: LucideIcon;
  keywords: string[];
  score: number;
  onSelect: () => void;
  shortcut?: string;
  subtitle?: string;
  statusColor?: string;
  group: string;
}

export interface CommandContext {
  activeTaskId: string | null;
  query: string;
}

export type CommandProvider = (context: CommandContext) => CommandItem[];
