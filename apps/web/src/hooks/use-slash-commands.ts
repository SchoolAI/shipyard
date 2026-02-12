import type { LucideIcon } from 'lucide-react';
import { Brain, Cpu, HelpCircle, ListChecks, Trash2 } from 'lucide-react';
import type { KeyboardEvent } from 'react';
import { useCallback, useMemo, useState } from 'react';

export interface SlashCommand {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  keywords: string[];
  shortcut?: string;
}

const COMMANDS: SlashCommand[] = [
  {
    id: 'plan',
    name: 'Plan mode',
    description: 'Toggle plan mode',
    icon: ListChecks,
    keywords: ['plan', 'planning'],
  },
  {
    id: 'model',
    name: 'Switch model',
    description: 'Change the AI model',
    icon: Cpu,
    keywords: ['model', 'claude'],
  },
  {
    id: 'reasoning',
    name: 'Reasoning effort',
    description: 'Adjust reasoning level',
    icon: Brain,
    keywords: ['reasoning', 'think'],
  },
  {
    id: 'clear',
    name: 'Clear chat',
    description: 'Clear conversation history',
    icon: Trash2,
    keywords: ['clear', 'reset'],
  },
  {
    id: 'help',
    name: 'Help',
    description: 'Show available commands',
    icon: HelpCircle,
    keywords: ['help', 'commands'],
  },
];

interface SlashCommandState {
  isOpen: boolean;
  query: string;
  filteredCommands: SlashCommand[];
  selectedIndex: number;
  handleInputChange: (value: string) => void;
  handleKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => boolean;
  selectCommand: (command: SlashCommand) => void;
  close: () => void;
}

interface UseSlashCommandsOptions {
  onExecute: (command: SlashCommand) => void;
  onClearInput: () => void;
}

/**
 * Detects "/" at the start of input or after whitespace,
 * filters commands, and manages keyboard navigation.
 */
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
        cmd.keywords.some((kw) => kw.includes(lowerQuery))
    );
  }, [isOpen, query]);

  const close = useCallback(() => {
    setIsOpen(false);
    setQuery('');
    setSelectedIndex(0);
  }, []);

  const selectCommand = useCallback(
    (command: SlashCommand) => {
      onExecute(command);
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

  return {
    isOpen,
    query,
    filteredCommands,
    selectedIndex,
    handleInputChange,
    handleKeyDown,
    selectCommand,
    close,
  };
}
