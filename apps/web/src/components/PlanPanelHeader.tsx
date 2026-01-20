/**
 * Action summary header for slide-out plan panel.
 * Shows plan title, status, deliverables progress, and quick actions.
 */

import { Button, Chip } from '@heroui/react';
import type { PlanMetadata, PlanStatusType } from '@shipyard/schema';
import { AlertTriangle, Check, Clock } from 'lucide-react';
import { assertNever } from '../utils/assert-never';
import { PanelControlButtons } from './PanelControlButtons';
import type { PanelWidth } from './PlanPanel';
import { TagChip } from './TagChip';

export interface PlanPanelHeaderProps {
  /** Plan metadata */
  metadata: PlanMetadata;
  /** Deliverable completion stats */
  deliverableStats: { completed: number; total: number };
  /** Last activity description */
  lastActivityText: string;
  /** Approve callback */
  onApprove: () => void;
  /** Request changes callback */
  onRequestChanges: () => void;
  /** Close panel */
  onClose: () => void;
  /** Expand panel to next size. If not provided, expand button is hidden. */
  onExpand?: () => void;
  /** Toggle full screen */
  onFullScreen: () => void;
  /** Current panel width */
  width: PanelWidth;
}

/** Map status to display config */
function getStatusConfig(status: PlanStatusType): {
  label: string;
  color: 'warning' | 'danger' | 'success' | 'default' | 'accent';
  icon: React.ReactNode;
  needsReview: boolean;
} {
  switch (status) {
    case 'pending_review':
      return {
        label: 'NEEDS YOUR REVIEW',
        color: 'warning',
        icon: <Clock className="w-3 h-3" />,
        needsReview: true,
      };
    case 'changes_requested':
      return {
        label: 'CHANGES REQUESTED',
        color: 'danger',
        icon: <AlertTriangle className="w-3 h-3" />,
        needsReview: false,
      };
    case 'in_progress':
      return {
        label: 'In Progress',
        color: 'accent',
        icon: null,
        needsReview: false,
      };
    case 'draft':
      return {
        label: 'Draft',
        color: 'default',
        icon: null,
        needsReview: false,
      };
    case 'completed':
      return {
        label: 'Completed',
        color: 'success',
        icon: <Check className="w-3 h-3" />,
        needsReview: false,
      };
    default:
      assertNever(status);
  }
}

export function PlanPanelHeader({
  metadata,
  deliverableStats,
  lastActivityText,
  onApprove,
  onRequestChanges,
  onClose,
  onExpand,
  onFullScreen,
  width,
}: PlanPanelHeaderProps) {
  const statusConfig = getStatusConfig(metadata.status);
  const showReviewActions = metadata.status === 'pending_review';

  return (
    <div className="border-b border-separator bg-surface shrink-0">
      {/* Title row with controls */}
      <div className="flex items-center justify-between gap-3 px-3 py-2">
        <h2 className="font-semibold text-foreground truncate flex-1 text-base">
          {metadata.title}
        </h2>

        <PanelControlButtons
          width={width}
          onExpand={onExpand}
          onFullScreen={onFullScreen}
          onClose={onClose}
        />
      </div>

      {/* Status and metadata row */}
      <div className="px-3 py-2 flex items-center justify-between gap-2 border-t border-separator/50">
        {/* Status banner or chip */}
        <div className="flex items-center gap-2 min-w-0">
          {statusConfig.needsReview ? (
            <div className="flex items-center gap-1.5 text-warning shrink-0">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span className="text-xs font-medium">{statusConfig.label}</span>
            </div>
          ) : (
            <Chip size="sm" variant="soft" color={statusConfig.color} className="gap-1">
              {statusConfig.icon}
              {statusConfig.label}
            </Chip>
          )}

          {/* Tags */}
          {metadata.tags && metadata.tags.length > 0 && (
            <div className="flex gap-1 items-center flex-wrap">
              {metadata.tags.slice(0, 3).map((tag) => (
                <TagChip key={tag} tag={tag} size="sm" />
              ))}
              {metadata.tags.length > 3 && (
                <span className="text-xs text-muted-foreground">+{metadata.tags.length - 3}</span>
              )}
            </div>
          )}

          {/* Progress and activity on same line */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground truncate">
            {deliverableStats.total > 0 && (
              <>
                <span className="text-separator">•</span>
                <span className="shrink-0">
                  {deliverableStats.completed}/{deliverableStats.total} deliverables
                </span>
              </>
            )}
            {lastActivityText && (
              <>
                <span className="text-separator">•</span>
                <span className="truncate">{lastActivityText}</span>
              </>
            )}
          </div>
        </div>

        {/* Quick action buttons for pending review */}
        {showReviewActions && (
          <div className="flex items-center gap-1.5 shrink-0">
            <Button
              size="sm"
              className="bg-success hover:bg-success-dark text-white h-7 px-2 text-xs"
              onPress={onApprove}
            >
              <Check className="w-3 h-3" />
              Approve
            </Button>
            <Button
              size="sm"
              variant="danger"
              className="h-7 px-2 text-xs"
              onPress={onRequestChanges}
            >
              <AlertTriangle className="w-3 h-3" />
              Request Changes
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
