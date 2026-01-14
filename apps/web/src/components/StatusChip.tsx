import { Chip } from '@heroui/react';
import type { PlanStatusType } from '@peer-plan/schema';
import { Check, Circle, CircleDot, Clock, X } from 'lucide-react';
import type { ComponentProps } from 'react';

type ChipColor = ComponentProps<typeof Chip>['color'];
type ChipVariant = ComponentProps<typeof Chip>['variant'];

interface StatusConfig {
  color: ChipColor;
  variant: ChipVariant;
  icon: typeof Circle;
  label: string;
}

const statusConfig: Record<PlanStatusType, StatusConfig> = {
  draft: { color: 'default', variant: 'soft', icon: Circle, label: 'draft' },
  pending_review: { color: 'warning', variant: 'soft', icon: Clock, label: 'pending review' },
  changes_requested: { color: 'danger', variant: 'soft', icon: X, label: 'changes requested' },
  in_progress: { color: 'accent', variant: 'soft', icon: CircleDot, label: 'in progress' },
  completed: { color: 'success', variant: 'primary', icon: Check, label: 'completed' },
};

interface StatusChipProps {
  status: PlanStatusType;
  className?: string;
}

export function StatusChip({ status, className }: StatusChipProps) {
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <Chip color={config.color} variant={config.variant} className={className}>
      <Icon className="w-3 h-3" />
      {config.label}
    </Chip>
  );
}
