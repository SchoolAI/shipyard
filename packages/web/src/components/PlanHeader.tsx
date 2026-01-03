import { getPlanMetadata, type PlanMetadata } from '@peer-plan/schema';
import { useEffect, useState } from 'react';
import type * as Y from 'yjs';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader } from '@/components/ui/card';

interface PlanHeaderFallback {
  title: string;
  status: string;
  repo?: string;
  pr?: number;
}

interface PlanHeaderProps {
  ydoc: Y.Doc;
  fallback: PlanHeaderFallback;
}

export function PlanHeader({ ydoc, fallback }: PlanHeaderProps) {
  const [metadata, setMetadata] = useState<PlanMetadata | null>(null);

  useEffect(() => {
    const metaMap = ydoc.getMap('metadata');

    const update = () => setMetadata(getPlanMetadata(ydoc));
    update(); // Initial read

    metaMap.observe(update);
    return () => metaMap.unobserve(update);
  }, [ydoc]);

  // Use CRDT metadata if available, otherwise fall back to URL snapshot
  const display = metadata || fallback;

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
          <h1 className="text-3xl font-bold">{display.title}</h1>
          <Badge variant={getStatusVariant(display.status)}>
            {display.status.replace('_', ' ')}
          </Badge>
        </div>
        {(display.repo || display.pr) && (
          <p className="text-sm text-muted-foreground mt-2">
            {display.repo && <span>{display.repo}</span>}
            {display.pr && <span className="ml-2">PR #{display.pr}</span>}
          </p>
        )}
      </CardHeader>
    </Card>
  );
}
