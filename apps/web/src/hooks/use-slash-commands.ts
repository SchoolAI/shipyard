import type { PermissionMode } from '@shipyard/loro-schema';
import type { LucideIcon } from 'lucide-react';
import {
  Brain,
  Cpu,
  FileCheck,
  FolderGit,
  GitBranch,
  HelpCircle,
  ListChecks,
  Shield,
  ShieldOff,
  Trash2,
} from 'lucide-react';
import type { KeyboardEvent } from 'react';
import { useCallback, useMemo, useState } from 'react';
import type { ReasoningLevel } from '../components/composer/reasoning-effort';
import { fuzzyScore } from '../utils/fuzzy-match';
import type { GitRepoInfo } from './use-machine-selection';

export type SlashCommandAction =
  | { kind: 'setPermissionMode'; mode: PermissionMode }
  | { kind: 'setModel'; modelId: string }
  | { kind: 'setReasoning'; level: ReasoningLevel }
  | { kind: 'setEnvironment'; path: string }
  | { kind: 'clear' }
  | { kind: 'help' }
  | { kind: 'createWorktree' };

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
    description: 'Switch to plan mode (no tool execution)',
    icon: ListChecks,
    keywords: ['plan', 'planning'],
    action: { kind: 'setPermissionMode', mode: 'plan' },
  },
  {
    id: 'permission:default',
    name: 'Default permissions',
    description: 'Prompt for dangerous operations',
    icon: Shield,
    keywords: ['permission', 'default', 'safe'],
    action: { kind: 'setPermissionMode', mode: 'default' },
    parentLabel: 'Permission mode',
  },
  {
    id: 'permission:accept-edits',
    name: 'Accept edits',
    description: 'Auto-accept file edits',
    icon: FileCheck,
    keywords: ['permission', 'accept', 'edits'],
    action: { kind: 'setPermissionMode', mode: 'accept-edits' },
    parentLabel: 'Permission mode',
  },
  {
    id: 'permission:bypass',
    name: 'Bypass permissions',
    description: 'Skip all permission checks',
    icon: ShieldOff,
    keywords: ['permission', 'bypass', 'skip', 'yolo'],
    action: { kind: 'setPermissionMode', mode: 'bypass' },
    parentLabel: 'Permission mode',
  },
  {
    id: 'model:claude-opus-4-6',
    name: 'Claude Opus 4.6',
    description: 'Most capable, deep reasoning',
    icon: Cpu,
    keywords: ['model', 'switch', 'claude', 'opus', '4.6', '46'],
    action: { kind: 'setModel', modelId: 'claude-opus-4-6' },
    parentLabel: 'Switch model',
  },
  {
    id: 'model:claude-sonnet-4-5',
    name: 'Claude Sonnet 4.5',
    description: 'Fast and balanced',
    icon: Cpu,
    keywords: ['model', 'switch', 'claude', 'sonnet', '4.5', '45'],
    action: { kind: 'setModel', modelId: 'claude-sonnet-4-5-20250929' },
    parentLabel: 'Switch model',
  },
  {
    id: 'model:claude-haiku-4-5',
    name: 'Claude Haiku 4.5',
    description: 'Fastest responses',
    icon: Cpu,
    keywords: ['model', 'switch', 'claude', 'haiku', '4.5', '45'],
    action: { kind: 'setModel', modelId: 'claude-haiku-4-5-20251001' },
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
    id: 'worktree',
    name: 'New worktree',
    description: 'Create a new git worktree from the current environment',
    icon: GitBranch,
    keywords: ['worktree', 'branch', 'wt'],
    action: { kind: 'createWorktree' },
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
  environments?: GitRepoInfo[];
}

export function useSlashCommands({
  onExecute,
  onClearInput,
  environments,
}: UseSlashCommandsOptions): SlashCommandState {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const allCommands = useMemo(() => {
    const envCommands: SlashCommandItem[] = (environments ?? []).map((env) => ({
      id: `env:${env.path}`,
      name: `${env.name} (${env.branch})`,
      description: env.path,
      icon: FolderGit,
      keywords: ['env', 'environment', 'repo', env.name, env.branch, env.path],
      action: { kind: 'setEnvironment' as const, path: env.path },
      parentLabel: 'Environment',
    }));
    return [...COMMANDS, ...envCommands];
  }, [environments]);

  const filteredCommands = useMemo(() => {
    if (!isOpen) return [];
    if (!query) return allCommands;

    const scored = allCommands
      .map((cmd) => {
        const targets = [cmd.name, cmd.id, ...(cmd.parentLabel ? [cmd.parentLabel] : [])];
        const targetScore = Math.max(-1, ...targets.map((t) => fuzzyScore(query, t)));
        const keywordScore =
          cmd.keywords.length > 0
            ? Math.max(-1, ...cmd.keywords.map((kw) => fuzzyScore(query, kw)))
            : -1;
        const best = Math.max(targetScore, keywordScore);
        return { cmd, score: best };
      })
      .filter((entry) => entry.score >= 0);

    scored.sort((a, b) => b.score - a.score);
    return scored.map((entry) => entry.cmd);
  }, [isOpen, query, allCommands]);

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
      const slashMatch = /(?:^|\s)\/([\w.-]*)$/.exec(value);

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
