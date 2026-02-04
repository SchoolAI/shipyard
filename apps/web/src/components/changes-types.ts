export interface SyncedFileChange {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  patch: string;
  staged: boolean;
}

export interface ChangeSnapshot {
  machineId: string;
  machineName: string;
  ownerId: string;
  headSha: string;
  branch: string;
  cwd: string;
  isLive: boolean;
  updatedAt: number;
  files: SyncedFileChange[];
  totalAdditions: number;
  totalDeletions: number;
}

export function isChangeSnapshot(value: unknown): value is ChangeSnapshot {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.machineId === 'string' &&
    typeof obj.machineName === 'string' &&
    typeof obj.ownerId === 'string' &&
    typeof obj.headSha === 'string' &&
    typeof obj.branch === 'string' &&
    typeof obj.cwd === 'string' &&
    typeof obj.isLive === 'boolean' &&
    typeof obj.updatedAt === 'number' &&
    Array.isArray(obj.files) &&
    typeof obj.totalAdditions === 'number' &&
    typeof obj.totalDeletions === 'number'
  );
}

export interface LinkedPR {
  prNumber: number;
  status: 'draft' | 'open' | 'merged' | 'closed';
  branch: string | null;
  title: string | null;
}

export function isLinkedPR(value: unknown): value is LinkedPR {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.prNumber === 'number' &&
    typeof obj.status === 'string' &&
    ['draft', 'open', 'merged', 'closed'].includes(obj.status) &&
    (obj.branch === null || typeof obj.branch === 'string') &&
    (obj.title === null || typeof obj.title === 'string')
  );
}

export type ChangeSource = 'local' | 'pr';

export interface MachinePickerState {
  snapshots: Record<string, ChangeSnapshot>;
  localMachineId: string | null;
  selectedMachineId: string | null;
  onSelectMachine: (machineId: string | null) => void;
  shouldShow: boolean;
}

export interface ChangesViewState {
  source: ChangeSource;
  setSource: (source: ChangeSource) => void;
  selectedPR: LinkedPR | null;
  hasPRs: boolean;
  machinePicker: MachinePickerState;
}
