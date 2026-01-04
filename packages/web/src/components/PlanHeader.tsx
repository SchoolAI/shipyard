import type { PlanMetadata, PlanStatusType } from '@peer-plan/schema';
import { MessageSquare } from 'lucide-react';
import type * as Y from 'yjs';
import { ReviewActions } from '@/components/ReviewActions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import type { UserIdentity } from '@/utils/identity';

interface PlanHeaderProps {
  ydoc: Y.Doc;
  /** Current metadata from parent component */
  metadata: PlanMetadata;
  /** User identity for review actions */
  identity: UserIdentity | null;
  /** Called when user needs to set up identity */
  onRequestIdentity: () => void;
  /** Called after status is successfully updated in the plan doc */
  onStatusChange?: (newStatus: 'approved' | 'changes_requested') => void;
  /** Number of comment threads (optional - hides button if not provided) */
  commentCount?: number;
  /** Whether comments panel is open */
  commentsPanelOpen?: boolean;
  /** Toggle comments panel */
  onToggleComments?: () => void;
}

export function PlanHeader({
  ydoc,
  metadata,
  identity,
  onRequestIdentity,
  onStatusChange,
  commentCount,
  commentsPanelOpen,
  onToggleComments,
}: PlanHeaderProps) {
  // No local state or observer - metadata comes from parent to avoid duplicate observers
  const display = metadata;

  const getStatusVariant = (status: PlanStatusType) => {
    switch (status) {
      case 'approved':
        return 'default';
      case 'pending_review':
        return 'secondary';
      case 'changes_requested':
        return 'destructive';
      case 'draft':
        return 'outline';
      default: {
        // Exhaustiveness check
        status satisfies never;
        return 'outline';
      }
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-3xl font-bold">{display.title}</h1>
          <div className="flex items-center gap-2 shrink-0">
            {onToggleComments && (
              <Button
                variant={commentsPanelOpen ? 'secondary' : 'ghost'}
                size="sm"
                onClick={onToggleComments}
                className="gap-1.5"
                aria-label={commentsPanelOpen ? 'Hide comments' : 'Show comments'}
              >
                <MessageSquare className="h-4 w-4" />
                <span>
                  Comments{commentCount != null && commentCount > 0 && ` (${commentCount})`}
                </span>
              </Button>
            )}
            <Badge variant={getStatusVariant(display.status)}>
              {display.status.replace('_', ' ')}
            </Badge>
          </div>
        </div>
        {(display.repo || display.pr) && (
          <p className="text-sm text-muted-foreground mt-2">
            {display.repo && <span>{display.repo}</span>}
            {display.pr && <span className="ml-2">PR #{display.pr}</span>}
          </p>
        )}
        {/* Review actions */}
        <div className="mt-4 pt-4 border-t border-gray-100">
          <ReviewActions
            ydoc={ydoc}
            currentStatus={display.status}
            identity={identity}
            onRequestIdentity={onRequestIdentity}
            onStatusChange={onStatusChange}
          />
        </div>
      </CardHeader>
    </Card>
  );
}
