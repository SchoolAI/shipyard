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
import { Avatar, Card, Chip, Tooltip } from '@heroui/react';

const AvatarRoot = Avatar as React.FC<{
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}>;
const AvatarImage = Avatar.Image as React.FC<{ src?: string; alt: string }>;
const AvatarFallback = Avatar.Fallback as React.FC<{
  children: React.ReactNode;
  className?: string;
}>;

import type { PlanIndexEntry, PlanStatusType } from '@shipyard/schema';
import { CheckSquare, GitPullRequest } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { TagChip } from '@/components/TagChip';
import { getPlanRoute } from '@/constants/routes';
import { isPlanMetadataLoaded, usePlanMetadata } from '@/hooks/usePlanMetadata';
import { assertNever } from '@/utils/assert-never';
import { formatRelativeTime } from '@/utils/formatters';

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
    default:
      assertNever(status);
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
      navigate(getPlanRoute(plan.id));
    }
  };

  const metadataLoaded = isPlanMetadataLoaded(metadata);
  const hasDeliverables = metadataLoaded && metadata.deliverableCount > 0;
  const hasPR = metadataLoaded && metadata.linkedPRs.length > 0;
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
          border-l-3 ${borderColorClass}
          hover:translate-y-[-2px] hover:shadow-lg
          ${isDragging ? 'shadow-xl ring-2 ring-accent' : 'shadow-md'}
        `}
      >
        <Card.Header className="p-4">
          {/* Title with proper truncation and tooltip */}
          {plan.title.length > 50 ? (
            <Tooltip delay={0}>
              <Tooltip.Trigger>
                <Card.Title
                  className="text-base font-semibold leading-snug cursor-default"
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
              </Tooltip.Trigger>
              <Tooltip.Content className="max-w-md">{plan.title}</Tooltip.Content>
            </Tooltip>
          ) : (
            <Card.Title
              className="text-base font-semibold leading-snug"
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
          )}
        </Card.Header>

        {/* Metadata footer */}
        <Card.Content className="px-4 pb-4 pt-2">
          <div className="flex items-center gap-2 flex-wrap">
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

            {metadataLoaded && hasPR && (
              <Chip size="sm" variant="soft" color="accent" className="gap-1">
                <GitPullRequest className="w-3 h-3" />
                <span>{metadata.linkedPRs.length > 1 ? metadata.linkedPRs.length : ''}</span>
              </Chip>
            )}

            {metadataLoaded && hasDeliverables && (
              <Chip
                size="sm"
                variant="soft"
                color={
                  metadata.completedDeliverables === metadata.deliverableCount
                    ? 'success'
                    : 'default'
                }
                className="gap-1"
              >
                <CheckSquare className="w-3 h-3" />
                <span>
                  {metadata.completedDeliverables}/{metadata.deliverableCount}
                </span>
              </Chip>
            )}

            {/* Tags (show first 2 to save space) */}
            {plan.tags && plan.tags.length > 0 && (
              <div className="flex gap-1 items-center">
                {plan.tags.slice(0, 2).map((tag) => (
                  <TagChip key={tag} tag={tag} size="sm" />
                ))}
                {plan.tags.length > 2 && (
                  <span className="text-[10px] text-muted-foreground">+{plan.tags.length - 2}</span>
                )}
              </div>
            )}
          </div>

          {/* Updated time - separate row for cleaner layout */}
          <div className="mt-3 text-xs text-muted-foreground">
            Updated {formatRelativeTime(plan.updatedAt)}
          </div>
        </Card.Content>
      </Card>
    </div>
  );
}
