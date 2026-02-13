import type { LucideIcon } from 'lucide-react';
import { Brain, Cpu, HelpCircle, ListChecks, Trash2 } from 'lucide-react';
import type { KeyboardEvent } from 'react';
import { useCallback, useMemo, useState } from 'react';
import type { ReasoningLevel } from '../components/composer/reasoning-effort';

export type SlashCommandAction =
  | { kind: 'toggle'; target: 'planMode' }
  | { kind: 'setModel'; modelId: string }
  | { kind: 'setReasoning'; level: ReasoningLevel }
  | { kind: 'clear' }
  | { kind: 'help' };

export interface SlashCommandItem {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  keywords: string[];
  action: SlashCommandAction;
  parentLabel?: string;
}

const COMMANDS: SlashCommandItem[] = [
  {
    id: 'plan',
    name: 'Plan mode',
    description: 'Toggle plan mode on/off',
    icon: ListChecks,
    keywords: ['plan', 'planning', 'toggle'],
    action: { kind: 'toggle', target: 'planMode' },
  },
  {
    id: 'model:claude-code',
    name: 'claude-code',
    description: 'Optimized for coding tasks',
    icon: Cpu,
    keywords: ['model', 'switch', 'claude', 'code'],
    action: { kind: 'setModel', modelId: 'claude-code' },
    parentLabel: 'Switch model',
  },
  {
    id: 'model:claude-opus',
    name: 'claude-opus',
    description: 'Most capable, deep reasoning',
    icon: Cpu,
    keywords: ['model', 'switch', 'claude', 'opus'],
    action: { kind: 'setModel', modelId: 'claude-opus' },
    parentLabel: 'Switch model',
  },
  {
    id: 'model:claude-sonnet',
    name: 'claude-sonnet',
    description: 'Fast and balanced',
    icon: Cpu,
    keywords: ['model', 'switch', 'claude', 'sonnet'],
    action: { kind: 'setModel', modelId: 'claude-sonnet' },
    parentLabel: 'Switch model',
  },
  {
    id: 'reasoning:low',
    name: 'Low',
    description: 'Minimal reasoning',
    icon: Brain,
    keywords: ['reasoning', 'effort', 'think', 'low'],
    action: { kind: 'setReasoning', level: 'low' },
    parentLabel: 'Reasoning effort',
  },
  {
    id: 'reasoning:medium',
    name: 'Medium',
    description: 'Balanced reasoning',
    icon: Brain,
    keywords: ['reasoning', 'effort', 'think', 'medium'],
    action: { kind: 'setReasoning', level: 'medium' },
    parentLabel: 'Reasoning effort',
  },
  {
    id: 'reasoning:high',
    name: 'High',
    description: 'Maximum reasoning depth',
    icon: Brain,
    keywords: ['reasoning', 'effort', 'think', 'high'],
    action: { kind: 'setReasoning', level: 'high' },
    parentLabel: 'Reasoning effort',
  },
  {
    id: 'clear',
    name: 'Clear chat',
    description: 'Clear conversation history',
    icon: Trash2,
    keywords: ['clear', 'reset', 'delete'],
    action: { kind: 'clear' },
  },
  {
    id: 'help',
    name: 'Help',
    description: 'Show available commands',
    icon: HelpCircle,
    keywords: ['help', 'commands'],
    action: { kind: 'help' },
  },
];

interface SlashCommandState {
  isOpen: boolean;
  query: string;
  filteredCommands: SlashCommandItem[];
  selectedIndex: number;
  setSelectedIndex: (index: number) => void;
  handleInputChange: (value: string) => void;
  handleKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => boolean;
  selectCommand: (command: SlashCommandItem) => void;
  close: () => void;
}

interface UseSlashCommandsOptions {
  onExecute: (action: SlashCommandAction) => void;
  onClearInput: () => void;
}

export function useSlashCommands({
  onExecute,
  onClearInput,
}: UseSlashCommandsOptions): SlashCommandState {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const filteredCommands = useMemo(() => {
    if (!isOpen) return [];
    if (!query) return COMMANDS;

    const lowerQuery = query.toLowerCase();
    return COMMANDS.filter(
      (cmd) =>
        cmd.name.toLowerCase().includes(lowerQuery) ||
        cmd.id.toLowerCase().includes(lowerQuery) ||
        cmd.keywords.some((kw) => kw.includes(lowerQuery)) ||
        (cmd.parentLabel?.toLowerCase().includes(lowerQuery) ?? false)
    );
  }, [isOpen, query]);

  const close = useCallback(() => {
    setIsOpen(false);
    setQuery('');
    setSelectedIndex(0);
  }, []);

  const selectCommand = useCallback(
    (command: SlashCommandItem) => {
      onExecute(command.action);
      onClearInput();
      close();
    },
    [onExecute, onClearInput, close]
  );

  const handleInputChange = useCallback(
    (value: string) => {
      const slashMatch = /(?:^|\s)\/([\w]*)$/.exec(value);

      if (slashMatch) {
        const matchedQuery = slashMatch[1] ?? '';
        setIsOpen(true);
        setQuery(matchedQuery);
        setSelectedIndex(0);
      } else {
        close();
      }
    },
    [close]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>): boolean => {
      if (!isOpen || filteredCommands.length === 0) return false;

      switch (e.key) {
        case 'ArrowDown': {
          e.preventDefault();
          setSelectedIndex((prev) => (prev + 1) % filteredCommands.length);
          return true;
        }
        case 'ArrowUp': {
          e.preventDefault();
          setSelectedIndex(
            (prev) => (prev - 1 + filteredCommands.length) % filteredCommands.length
          );
          return true;
        }
        case 'Enter': {
          e.preventDefault();
          const selected = filteredCommands[selectedIndex];
          if (selected) {
            selectCommand(selected);
          }
          return true;
        }
        case 'Escape': {
          e.preventDefault();
          close();
          return true;
        }
        case 'Tab': {
          e.preventDefault();
          const selected = filteredCommands[selectedIndex];
          if (selected) {
            selectCommand(selected);
          }
          return true;
        }
        default:
          return false;
      }
    },
    [isOpen, filteredCommands, selectedIndex, selectCommand, close]
  );

  return useMemo(
    () => ({
      isOpen,
      query,
      filteredCommands,
      selectedIndex,
      setSelectedIndex,
      handleInputChange,
      handleKeyDown,
      selectCommand,
      close,
    }),
    [
      isOpen,
      query,
      filteredCommands,
      selectedIndex,
      handleInputChange,
      handleKeyDown,
      selectCommand,
      close,
    ]
  );
}
