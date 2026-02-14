import { Button, ListBox, Popover, ScrollShadow, Tooltip } from '@heroui/react';
import type { GitRepoInfo } from '@shipyard/session';
import { AlertCircle, Check, ChevronDown, Globe, Home, Search } from 'lucide-react';
import type { Key } from 'react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { fuzzyScore } from '../../utils/fuzzy-match';

const HOME_KEY = '__home__';

export interface EnvironmentPickerProps {
  environments: GitRepoInfo[];
  selectedPath: string | null;
  onSelect: (path: string | null) => void;
  homeDir?: string;
}

function computeLabel(
  selectedEnvironment: GitRepoInfo | undefined,
  isHomeDir: boolean,
  environmentCount: number
): string {
  if (isHomeDir) return '~ (Home)';
  if (selectedEnvironment) return `${selectedEnvironment.name} (${selectedEnvironment.branch})`;
  if (environmentCount > 0) return 'Select environment';
  return 'No environment';
}

function computeTooltip(
  hasUnselectedEnvironments: boolean,
  isHomeDir: boolean,
  label: string
): string {
  if (hasUnselectedEnvironments)
    return 'No environment selected \u2014 agent will use home directory';
  if (isHomeDir) return 'Home directory \u2014 select a project for better results';
  return label;
}

function HomeItem({ homeDir, isSelected }: { homeDir: string; isSelected: boolean }) {
  return (
    <ListBox.Item
      key={HOME_KEY}
      id={HOME_KEY}
      textValue="~ (Home directory)"
      className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
        isSelected ? 'bg-default' : 'hover:bg-default/50'
      }`}
    >
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <Home className="w-3.5 h-3.5 text-muted shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="text-sm text-foreground/90 truncate">~ (Home)</div>
          <div className="text-xs text-muted truncate">{homeDir}</div>
        </div>
        {isSelected && <Check className="w-3.5 h-3.5 text-accent shrink-0" aria-hidden="true" />}
      </div>
    </ListBox.Item>
  );
}

function EnvironmentItem({
  env,
  isSelected,
  isEnvHomeDir,
}: {
  env: GitRepoInfo;
  isSelected: boolean;
  isEnvHomeDir: boolean;
}) {
  const displayName = isEnvHomeDir ? '~ (Home directory)' : env.name;
  const subtitle = isEnvHomeDir ? env.path : `${env.branch} \u00B7 ${env.path}`;
  const textValue = isEnvHomeDir ? '~ (Home directory)' : `${env.name} (${env.branch})`;

  return (
    <ListBox.Item
      key={env.path}
      id={env.path}
      textValue={textValue}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
        isSelected ? 'bg-default' : 'hover:bg-default/50'
      }`}
    >
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <div className="min-w-0 flex-1">
          <div className="text-sm text-foreground/90 truncate">{displayName}</div>
          <div className="text-xs text-muted truncate">{subtitle}</div>
        </div>
        {isSelected && <Check className="w-3.5 h-3.5 text-accent shrink-0" aria-hidden="true" />}
      </div>
    </ListBox.Item>
  );
}

export function EnvironmentPicker({
  environments,
  selectedPath,
  onSelect,
  homeDir,
}: EnvironmentPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  const selectedEnvironment = environments.find((e) => e.path === selectedPath);
  const isSelectedHomeDir = !!(
    selectedEnvironment &&
    homeDir &&
    selectedEnvironment.path === homeDir
  );
  const isUsingHomeDir = !selectedEnvironment && !!homeDir;
  const isHomeDir = isSelectedHomeDir || isUsingHomeDir;
  const hasUnselectedEnvironments = environments.length > 0 && !selectedEnvironment && !homeDir;

  const label = computeLabel(selectedEnvironment, isHomeDir, environments.length);
  const tooltipContent = computeTooltip(hasUnselectedEnvironments, isHomeDir, label);

  const filteredEnvironments = useMemo(() => {
    if (!query) {
      return [...environments].sort((a, b) => a.name.localeCompare(b.name));
    }

    const scored = environments
      .map((env) => {
        const best = Math.max(
          fuzzyScore(query, env.name),
          fuzzyScore(query, env.path),
          fuzzyScore(query, env.branch)
        );
        return { env, score: best };
      })
      .filter((entry) => entry.score >= 0);

    scored.sort((a, b) => b.score - a.score);
    return scored.map((entry) => entry.env);
  }, [environments, query]);

  const showHomeOption =
    homeDir && (!query || fuzzyScore(query, 'home') >= 0 || fuzzyScore(query, homeDir) >= 0);

  const handleOpenChange = useCallback((open: boolean) => {
    setIsOpen(open);
    if (open) {
      requestAnimationFrame(() => {
        searchRef.current?.focus();
      });
    } else {
      setQuery('');
    }
  }, []);

  const handleAction = useCallback(
    (key: Key) => {
      const keyStr = String(key);
      onSelect(keyStr === HOME_KEY ? null : keyStr);
      setIsOpen(false);
      setQuery('');
    },
    [onSelect]
  );

  if (environments.length === 0 && !homeDir) {
    return (
      <span className="flex items-center gap-1 text-xs text-muted">
        <Globe className="w-3 h-3" aria-hidden="true" />
        No environment
      </span>
    );
  }

  return (
    <Popover isOpen={isOpen} onOpenChange={handleOpenChange}>
      <Tooltip isDisabled={isOpen}>
        <Popover.Trigger>
          <Tooltip.Trigger>
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Environment: ${label}`}
              className={`flex items-center gap-1 transition-colors text-xs ${
                hasUnselectedEnvironments
                  ? 'text-warning hover:text-warning-600'
                  : 'text-muted hover:text-foreground'
              }`}
            >
              {hasUnselectedEnvironments ? (
                <AlertCircle className="w-3 h-3 shrink-0" aria-hidden="true" />
              ) : (
                <Globe className="w-3 h-3 shrink-0" aria-hidden="true" />
              )}
              <span className="truncate max-w-[4rem] sm:max-w-[8rem]">{label}</span>
              <ChevronDown className="w-2.5 h-2.5" aria-hidden="true" />
            </Button>
          </Tooltip.Trigger>
        </Popover.Trigger>
        <Tooltip.Content>{tooltipContent}</Tooltip.Content>
      </Tooltip>
      <Popover.Content placement="top" className="w-auto min-w-[240px] max-w-[340px] p-0">
        <Popover.Dialog>
          <div className="flex flex-col">
            <div className="px-3 py-2 border-b border-separator">
              <div className="flex items-center gap-2">
                <Search className="w-3.5 h-3.5 text-muted shrink-0" aria-hidden="true" />
                <input
                  ref={searchRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search environments..."
                  role="combobox"
                  aria-expanded={true}
                  aria-controls="environment-listbox"
                  aria-autocomplete="list"
                  aria-label="Search environments"
                  className="w-full bg-transparent text-sm text-foreground placeholder-muted outline-none"
                />
              </div>
            </div>
            <ScrollShadow className="max-h-[240px]">
              {filteredEnvironments.length > 0 || showHomeOption ? (
                <ListBox
                  id="environment-listbox"
                  aria-label="Environments"
                  selectionMode="none"
                  onAction={handleAction}
                  className="p-1"
                >
                  {showHomeOption && <HomeItem homeDir={homeDir} isSelected={isUsingHomeDir} />}
                  {filteredEnvironments.map((env) => (
                    <EnvironmentItem
                      key={env.path}
                      env={env}
                      isSelected={env.path === selectedPath}
                      isEnvHomeDir={!!(homeDir && env.path === homeDir)}
                    />
                  ))}
                </ListBox>
              ) : (
                <div className="px-3 py-4 text-center text-xs text-muted">
                  No environments match &ldquo;{query}&rdquo;
                </div>
              )}
            </ScrollShadow>
          </div>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}
