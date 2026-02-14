import { Button, ListBox, Popover, ScrollShadow, Tooltip } from '@heroui/react';
import type { GitRepoInfo } from '@shipyard/session';
import { Check, ChevronDown, Globe, Search } from 'lucide-react';
import type { Key } from 'react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { fuzzyScore } from '../../utils/fuzzy-match';

export interface EnvironmentPickerProps {
  environments: GitRepoInfo[];
  selectedPath: string | null;
  onSelect: (path: string | null) => void;
}

export function EnvironmentPicker({
  environments,
  selectedPath,
  onSelect,
}: EnvironmentPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  const selectedEnvironment = environments.find((e) => e.path === selectedPath);
  const label = selectedEnvironment
    ? `${selectedEnvironment.name} (${selectedEnvironment.branch})`
    : environments.length > 0
      ? 'Select environment'
      : 'No environment';

  const filteredEnvironments = useMemo(() => {
    if (!query) {
      return [...environments].sort((a, b) => a.name.localeCompare(b.name));
    }

    const scored = environments
      .map((env) => {
        const nameScore = fuzzyScore(query, env.name);
        const pathScore = fuzzyScore(query, env.path);
        const branchScore = fuzzyScore(query, env.branch);
        const best = Math.max(nameScore, pathScore, branchScore);
        return { env, score: best };
      })
      .filter((entry) => entry.score >= 0);

    scored.sort((a, b) => b.score - a.score);
    return scored.map((entry) => entry.env);
  }, [environments, query]);

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
      const path = String(key);
      onSelect(path);
      setIsOpen(false);
      setQuery('');
    },
    [onSelect]
  );

  if (environments.length === 0) {
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
              className="flex items-center gap-1 hover:text-foreground transition-colors text-xs text-muted"
            >
              <Globe className="w-3 h-3 shrink-0" aria-hidden="true" />
              <span className="truncate max-w-[4rem] sm:max-w-[8rem]">{label}</span>
              <ChevronDown className="w-2.5 h-2.5" aria-hidden="true" />
            </Button>
          </Tooltip.Trigger>
        </Popover.Trigger>
        <Tooltip.Content>{label}</Tooltip.Content>
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
              {filteredEnvironments.length > 0 ? (
                <ListBox
                  id="environment-listbox"
                  aria-label="Environments"
                  selectionMode="none"
                  onAction={handleAction}
                  className="p-1"
                >
                  {filteredEnvironments.map((env) => {
                    const isSelected = env.path === selectedPath;
                    return (
                      <ListBox.Item
                        key={env.path}
                        id={env.path}
                        textValue={`${env.name} (${env.branch})`}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                          isSelected ? 'bg-default' : 'hover:bg-default/50'
                        }`}
                      >
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <div className="min-w-0 flex-1">
                            <div className="text-sm text-foreground/90 truncate">{env.name}</div>
                            <div className="text-xs text-muted truncate">
                              {env.branch} &middot; {env.path}
                            </div>
                          </div>
                          {isSelected && (
                            <Check
                              className="w-3.5 h-3.5 text-accent shrink-0"
                              aria-hidden="true"
                            />
                          )}
                        </div>
                      </ListBox.Item>
                    );
                  })}
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
