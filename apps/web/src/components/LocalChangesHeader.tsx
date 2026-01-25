/**
 * Header component for local changes tab.
 * Renders in the tab bar (top-right) similar to VersionSelector.
 */
import { Button, Chip, Popover } from '@heroui/react';
import type { LocalChangesResult } from '@shipyard/schema';
import { Check, ChevronDown, CircleDot, GitBranch, Plus, RefreshCw } from 'lucide-react';
import { useState } from 'react';

interface LocalChangesHeaderProps {
  data: LocalChangesResult | undefined;
  isFetching: boolean;
  onRefresh: () => void;
}

export function LocalChangesHeader({ data, isFetching, onRefresh }: LocalChangesHeaderProps) {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  /** Don't render if data unavailable or no branch info */
  if (!data || !data.available) return null;

  const { branch, staged, unstaged, untracked, files } = data;

  return (
    <div className="flex items-center gap-2">
      <Popover isOpen={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
        <Button size="sm" variant="tertiary">
          <GitBranch className="w-4 h-4" />
          <code className="text-sm font-mono">{branch}</code>
          <ChevronDown className="w-3 h-3 ml-1" />
        </Button>

        <Popover.Content placement="bottom end" className="w-72">
          <Popover.Dialog>
            <Popover.Arrow />
            <Popover.Heading>Branch Info</Popover.Heading>

            <div className="flex flex-col gap-3 mt-3">
              <div className="flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-primary shrink-0" />
                <code className="text-sm font-medium truncate">{branch}</code>
              </div>

              <div className="flex items-center gap-2">
                <Chip size="sm" color="default">
                  {files.length} file{files.length !== 1 ? 's' : ''} changed
                </Chip>
              </div>

              <div className="flex flex-wrap gap-2">
                {staged.length > 0 && (
                  <Chip size="sm" color="success" className="flex items-center gap-1">
                    <Check className="w-3 h-3" />
                    {staged.length} staged
                  </Chip>
                )}
                {unstaged.length > 0 && (
                  <Chip size="sm" color="warning" className="flex items-center gap-1">
                    <CircleDot className="w-3 h-3" />
                    {unstaged.length} unstaged
                  </Chip>
                )}
                {untracked.length > 0 && (
                  <Chip size="sm" color="default" className="flex items-center gap-1">
                    <Plus className="w-3 h-3" />
                    {untracked.length} untracked
                  </Chip>
                )}
              </div>

              <div className="pt-2 border-t border-separator">
                <Button
                  size="sm"
                  variant="secondary"
                  onPress={() => {
                    onRefresh();
                    setIsPopoverOpen(false);
                  }}
                  isDisabled={isFetching}
                  isPending={isFetching}
                  className="w-full"
                >
                  <RefreshCw className="w-4 h-4" />
                  Refresh
                </Button>
              </div>
            </div>
          </Popover.Dialog>
        </Popover.Content>
      </Popover>
    </div>
  );
}
