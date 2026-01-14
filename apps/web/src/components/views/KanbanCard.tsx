/**
 * Draggable Kanban card representing a plan.
 * Uses @dnd-kit for drag-drop functionality.
 *
 * The entire card is draggable (like Linear/Notion) - no visible drag handle.
 * Click vs drag is differentiated by the activation constraint (8px movement).
 *
 * Shows:
 * - Plan title (with proper truncation)
 * - Owner avatar/username
 * - Deliverable progress
 * - PR indicator
 * - Last updated time
 * - Status-colored left border
 */

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Avatar, Card, Chip } from '@heroui/react';

const AvatarRoot = Avatar as React.FC<{ children: React.ReactNode; size?: 'sm' | 'md' | 'lg'; className?: string }>;
const AvatarImage = Avatar.Image as React.FC<{ src?: string; alt: string }>;
const AvatarFallback = Avatar.Fallback as React.FC<{ children: React.ReactNode; className?: string }>;

import type { PlanIndexEntry, PlanStatusType } from '@peer-plan/schema';
import { CheckSquare, GitPullRequest } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { usePlanMetadata } from '@/hooks/usePlanMetadata';
import { formatRelativeTime } from '@/utils/formatters';
import { SubstatusBadge } from './SubstatusBadge';

interface KanbanCardProps {
  plan: PlanIndexEntry;
  /** Callback when card is hovered (for Space bar peek preview) */
  onHover?: (planId: string | null) => void;
  /** Callback when card is clicked to open slide-out panel (if provided, prevents navigation) */
  onPanelOpen?: (planId: string) => void;
}

/**
 * Map status to Tailwind border color class.
 */
function getStatusBorderColor(status: PlanStatusType): string {
  switch (status) {
    case 'draft':
      return 'border-l-gray-500';
    case 'in_progress':
      return 'border-l-accent';
    case 'pending_review':
      return 'border-l-warning';
    case 'changes_requested':
      return 'border-l-danger';
    case 'completed':
      return 'border-l-success';
    default: {
      // @ts-expect-error: Exhaustive type check
      const _exhaustive: never = status;
      return 'border-l-gray-500';
    }
  }
}

export function KanbanCard({ plan, onHover, onPanelOpen }: KanbanCardProps) {
  const navigate = useNavigate();
  const metadata = usePlanMetadata(plan.id);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: plan.id,
    data: {
      type: 'plan',
      plan,
    },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const handleClick = () => {
    // If panel callback provided, open panel instead of navigating
    if (onPanelOpen) {
      onPanelOpen(plan.id);
    } else {
      navigate(`/plan/${plan.id}`);
    }
  };

  const hasDeliverables = metadata.deliverableCount > 0;
  const hasPR = metadata.linkedPRs.length > 0;
  const borderColorClass = getStatusBorderColor(plan.status);

  return (
    // biome-ignore lint/a11y/useSemanticElements: div required for dnd-kit sortable - button breaks drag behavior
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
      onMouseEnter={() => onHover?.(plan.id)}
      onMouseLeave={() => onHover?.(null)}
      role="button"
      tabIndex={0}
      className={isDragging ? 'cursor-grabbing' : 'cursor-grab'}
    >
      <Card
        variant="secondary"
        className={`
          group transition-all duration-150 pointer-events-none
          border-l-4 ${borderColorClass}
          hover:translate-y-[-2px] hover:shadow-lg
          ${isDragging ? 'shadow-xl ring-2 ring-accent' : 'shadow-sm'}
        `}
      >
        <Card.Header className="p-3 pb-2">
          {/* Title with proper truncation */}
          <Card.Title
            className="text-sm font-medium leading-snug"
            style={{
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              wordBreak: 'break-word',
            }}
          >
            {plan.title}
          </Card.Title>
        </Card.Header>

        {/* Metadata footer */}
        <Card.Content className="px-3 pb-3 pt-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <SubstatusBadge status={plan.status} />

            {/* Owner badge */}
            {plan.ownerId && (
              <div className="flex items-center gap-1 bg-surface-hover/60 rounded-full px-1.5 py-0.5">
                <AvatarRoot size="sm" className="w-4 h-4">
                  <AvatarImage
                    src={`https://github.com/${plan.ownerId}.png?size=32`}
                    alt={plan.ownerId}
                  />
                  <AvatarFallback className="text-[8px]">
                    {plan.ownerId.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </AvatarRoot>
                <span className="text-[10px] text-muted-foreground truncate max-w-[60px]">
                  {plan.ownerId}
                </span>
              </div>
            )}

            {/* PR indicator */}
            {hasPR && (
              <Chip
                size="sm"
                variant="soft"
                color="accent"
                className="h-5 text-[10px] px-1.5 gap-0.5"
              >
                <GitPullRequest className="w-3 h-3" />
                <span>{metadata.linkedPRs.length > 1 ? metadata.linkedPRs.length : ''}</span>
              </Chip>
            )}

            {/* Deliverables progress */}
            {hasDeliverables && (
              <Chip
                size="sm"
                variant="soft"
                color={
                  metadata.completedDeliverables === metadata.deliverableCount
                    ? 'success'
                    : 'default'
                }
                className="h-5 text-[10px] px-1.5 gap-0.5"
              >
                <CheckSquare className="w-3 h-3" />
                <span>
                  {metadata.completedDeliverables}/{metadata.deliverableCount}
                </span>
              </Chip>
            )}
          </div>

          {/* Updated time - separate row for cleaner layout */}
          <div className="mt-2 text-[10px] text-muted-foreground">
            Updated {formatRelativeTime(plan.updatedAt)}
          </div>
        </Card.Content>
      </Card>
    </div>
  );
}
