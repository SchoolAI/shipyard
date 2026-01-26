import type { ChangeSnapshot } from '@shipyard/schema';
import { MachineCard } from './machineCard';

export interface MachinePickerProps {
  snapshots: Map<string, ChangeSnapshot>;
  localMachineId: string | null;
  selectedMachineId: string | null;
  onSelectMachine: (machineId: string) => void;
}

export function MachinePicker({
  snapshots,
  localMachineId,
  selectedMachineId,
  onSelectMachine,
}: MachinePickerProps) {
  if (snapshots.size <= 1) {
    return null;
  }

  const sortedSnapshots = Array.from(snapshots.entries()).sort(([idA, a], [idB, b]) => {
    if (idA === localMachineId) return -1;
    if (idB === localMachineId) return 1;
    if (a.isLive !== b.isLive) return a.isLive ? -1 : 1;
    return b.updatedAt - a.updatedAt;
  });

  return (
    <div className="space-y-1.5 mb-2">
      {sortedSnapshots.map(([machineId, snapshot]) => (
        <MachineCard
          key={machineId}
          snapshot={snapshot}
          isLocalMachine={machineId === localMachineId}
          selected={machineId === selectedMachineId}
          onSelect={() => onSelectMachine(machineId)}
        />
      ))}
    </div>
  );
}
