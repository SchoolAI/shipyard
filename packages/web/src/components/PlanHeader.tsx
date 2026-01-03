import type { UrlEncodedPlan } from '@peer-plan/schema';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader } from '@/components/ui/card';

interface PlanHeaderProps {
  plan: UrlEncodedPlan;
}

export function PlanHeader({ plan }: PlanHeaderProps) {
  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'approved':
        return 'default';
      case 'pending_review':
        return 'secondary';
      case 'changes_requested':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">{plan.title}</h1>
          <Badge variant={getStatusVariant(plan.status)}>{plan.status.replace('_', ' ')}</Badge>
        </div>
        {(plan.repo || plan.pr) && (
          <p className="text-sm text-muted-foreground mt-2">
            {plan.repo && <span>{plan.repo}</span>}
            {plan.pr && <span className="ml-2">PR #{plan.pr}</span>}
          </p>
        )}
      </CardHeader>
    </Card>
  );
}
