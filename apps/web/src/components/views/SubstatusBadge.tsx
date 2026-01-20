import { Chip } from '@heroui/react';
import type { PlanStatusType } from '@shipyard/schema';

interface SubstatusBadgeProps {
  status: PlanStatusType;
}

export function SubstatusBadge({ status }: SubstatusBadgeProps) {
  if (status !== 'pending_review' && status !== 'changes_requested') {
    return null;
  }

  const config =
    status === 'pending_review'
      ? { label: 'Pending', color: 'warning' as const }
      : { label: 'Changes', color: 'danger' as const };

  return (
    <Chip size="sm" color={config.color} variant="soft">
      {config.label}
    </Chip>
  );
}
