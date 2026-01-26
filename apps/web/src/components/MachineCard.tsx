import { Avatar, Chip } from '@heroui/react';
import type { ChangeSnapshot } from '@shipyard/schema';
import { Clock, Monitor } from 'lucide-react';
import { formatRelativeTime } from '@/utils/formatters';

export interface MachineCardProps {
  snapshot: ChangeSnapshot;
  isLocalMachine: boolean;
  selected: boolean;
  onSelect: () => void;
}

export function MachineCard({ snapshot, isLocalMachine, selected, onSelect }: MachineCardProps) {
  const initials = snapshot.ownerId.slice(0, 2).toUpperCase();

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full p-3 rounded-lg border text-left transition-colors ${
        selected ? 'border-primary bg-primary/5' : 'border-separator hover:border-primary/50'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Monitor className="w-4 h-4 shrink-0" />
          <span className="font-medium truncate">{snapshot.machineName}</span>
          {isLocalMachine && (
            <Chip size="sm" color="accent" variant="soft">
              You
            </Chip>
          )}
        </div>
        <Chip size="sm" color={snapshot.isLive ? 'success' : 'default'} variant="soft">
          {snapshot.isLive ? 'Live' : 'Snapshot'}
        </Chip>
      </div>

      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span>
            {snapshot.files.length} file{snapshot.files.length !== 1 ? 's' : ''}
          </span>
          <span className="text-success">+{snapshot.totalAdditions}</span>
          <span className="text-danger">-{snapshot.totalDeletions}</span>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="w-3 h-3" />
            {formatRelativeTime(snapshot.updatedAt)}
          </div>
          <Avatar size="sm" className="size-5">
            <Avatar.Image
              alt={snapshot.ownerId}
              src={`https://github.com/${snapshot.ownerId}.png`}
            />
            <Avatar.Fallback className="text-xs">{initials}</Avatar.Fallback>
          </Avatar>
        </div>
      </div>
    </button>
  );
}
