/**
 * Peek preview modal for quick plan viewing.
 * Shows plan summary when hovering over a card and holding Space bar.
 * Linear-style feature for rapid plan review without navigation.
 */

import { Avatar, Button, Chip, Modal } from '@heroui/react';

const AvatarRoot = Avatar as React.FC<{ children: React.ReactNode; size?: 'sm' | 'md' | 'lg'; className?: string }>;
const AvatarImage = Avatar.Image as React.FC<{ src?: string; alt: string }>;
const AvatarFallback = Avatar.Fallback as React.FC<{ children: React.ReactNode; className?: string }>;
import type { Deliverable, LinkedPR, PlanIndexEntry, PlanStatusType } from '@peer-plan/schema';
import { getDeliverables, getLinkedPRs } from '@peer-plan/schema';
import { CheckSquare, ExternalLink, GitPullRequest, Square, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IndexeddbPersistence } from 'y-indexeddb';
import * as Y from 'yjs';
import { formatRelativeTime } from '@/utils/formatters';

interface PlanPeekModalProps {
  /** Plan to preview */
  plan: PlanIndexEntry;
  /** Whether the modal is open */
  isOpen: boolean;
  /** Callback when modal should close */
  onClose: () => void;
}

/** Map status to display label */
function getStatusLabel(status: PlanStatusType): string {
  switch (status) {
    case 'draft':
      return 'Draft';
    case 'in_progress':
      return 'In Progress';
    case 'pending_review':
      return 'Pending Review';
    case 'changes_requested':
      return 'Changes Requested';
    case 'completed':
      return 'Completed';
    default: {
      // @ts-expect-error: Exhaustive type check
      const _exhaustive: never = status;
      return status;
    }
  }
}

/** Map status to Chip color */
function getStatusColor(
  status: PlanStatusType
): 'default' | 'accent' | 'warning' | 'danger' | 'success' {
  switch (status) {
    case 'draft':
      return 'default';
    case 'in_progress':
      return 'accent';
    case 'pending_review':
      return 'warning';
    case 'changes_requested':
      return 'danger';
    case 'completed':
      return 'success';
    default: {
      // @ts-expect-error: Exhaustive type check
      const _exhaustive: never = status;
      return 'default';
    }
  }
}

interface PlanPeekData {
  deliverables: Deliverable[];
  linkedPRs: LinkedPR[];
  isLoading: boolean;
}

/**
 * Load plan data from IndexedDB for the peek preview.
 */
async function loadPlanPeekData(planId: string): Promise<Omit<PlanPeekData, 'isLoading'>> {
  try {
    const planDoc = new Y.Doc();
    const idb = new IndexeddbPersistence(planId, planDoc);
    await idb.whenSynced;

    const deliverables = getDeliverables(planDoc);
    const linkedPRs = getLinkedPRs(planDoc);

    idb.destroy();

    return { deliverables, linkedPRs };
  } catch {
    return { deliverables: [], linkedPRs: [] };
  }
}

export function PlanPeekModal({ plan, isOpen, onClose }: PlanPeekModalProps) {
  const navigate = useNavigate();
  const [peekData, setPeekData] = useState<PlanPeekData>({
    deliverables: [],
    linkedPRs: [],
    isLoading: true,
  });

  // Load plan data when modal opens
  useEffect(() => {
    if (!isOpen) {
      // Reset state when closed
      setPeekData({ deliverables: [], linkedPRs: [], isLoading: true });
      return;
    }

    let isActive = true;

    loadPlanPeekData(plan.id).then((data) => {
      if (isActive) {
        setPeekData({ ...data, isLoading: false });
      }
    });

    return () => {
      isActive = false;
    };
  }, [isOpen, plan.id]);

  const handleViewFull = () => {
    onClose();
    navigate(`/plan/${plan.id}`);
  };

  const completedCount = peekData.deliverables.filter((d) => d.linkedArtifactId).length;
  const totalCount = peekData.deliverables.length;

  return (
    <Modal.Backdrop
      isOpen={isOpen}
      onOpenChange={(open) => !open && onClose()}
      variant="blur"
      isDismissable
    >
      <Modal.Container placement="center" size="md">
        <Modal.Dialog className="sm:max-w-[480px]">
          {/* Custom close button */}
          <button
            type="button"
            onClick={onClose}
            className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-surface-hover transition-colors z-10"
            aria-label="Close preview"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>

          <Modal.Header className="pr-10">
            <Modal.Heading className="text-lg font-semibold leading-snug pr-4">
              {plan.title}
            </Modal.Heading>
            <div className="flex items-center gap-2 mt-2">
              <Chip size="sm" variant="soft" color={getStatusColor(plan.status)}>
                {getStatusLabel(plan.status)}
              </Chip>
              <span className="text-xs text-muted-foreground">
                Updated {formatRelativeTime(plan.updatedAt)}
              </span>
            </div>
          </Modal.Header>

          <Modal.Body className="py-4">
            {/* Owner */}
            {plan.ownerId && (
              <div className="flex items-center gap-2 mb-4">
                <AvatarRoot size="sm" className="w-6 h-6">
                  <AvatarImage
                    src={`https://github.com/${plan.ownerId}.png?size=48`}
                    alt={plan.ownerId}
                  />
                  <AvatarFallback className="text-xs">
                    {plan.ownerId.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </AvatarRoot>
                <span className="text-sm text-foreground">{plan.ownerId}</span>
              </div>
            )}

            {/* Deliverables */}
            {peekData.isLoading ? (
              <div className="text-sm text-muted-foreground py-2">Loading...</div>
            ) : (
              <>
                {peekData.deliverables.length > 0 && (
                  <div className="mb-4">
                    <div className="flex items-center gap-2 mb-2">
                      <CheckSquare className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm font-medium text-foreground">Deliverables</span>
                      <span className="text-xs text-muted-foreground">
                        ({completedCount}/{totalCount})
                      </span>
                    </div>
                    <ul className="space-y-1.5 ml-6">
                      {peekData.deliverables.slice(0, 5).map((deliverable) => (
                        <li key={deliverable.id} className="flex items-start gap-2">
                          {deliverable.linkedArtifactId ? (
                            <CheckSquare className="w-4 h-4 text-success shrink-0 mt-0.5" />
                          ) : (
                            <Square className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                          )}
                          <span
                            className={`text-sm ${
                              deliverable.linkedArtifactId
                                ? 'text-muted-foreground line-through'
                                : 'text-foreground'
                            }`}
                          >
                            {deliverable.text}
                          </span>
                        </li>
                      ))}
                      {peekData.deliverables.length > 5 && (
                        <li className="text-xs text-muted-foreground ml-6">
                          +{peekData.deliverables.length - 5} more
                        </li>
                      )}
                    </ul>
                  </div>
                )}

                {/* Linked PRs */}
                {peekData.linkedPRs.length > 0 && (
                  <div className="mb-4">
                    <div className="flex items-center gap-2 mb-2">
                      <GitPullRequest className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm font-medium text-foreground">Linked PRs</span>
                    </div>
                    <ul className="space-y-1.5 ml-6">
                      {peekData.linkedPRs.map((pr) => (
                        <li key={pr.prNumber} className="flex items-center gap-2">
                          <Chip
                            size="sm"
                            variant="soft"
                            color={pr.status === 'merged' ? 'success' : 'accent'}
                            className="h-5"
                          >
                            #{pr.prNumber}
                          </Chip>
                          <span className="text-sm text-foreground truncate flex-1">
                            {pr.title || `PR #${pr.prNumber}`}
                          </span>
                          <Chip size="sm" variant="soft" color="default" className="h-5 text-xs">
                            {pr.status}
                          </Chip>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Empty state */}
                {peekData.deliverables.length === 0 && peekData.linkedPRs.length === 0 && (
                  <div className="text-sm text-muted-foreground py-2">
                    No deliverables or linked PRs yet.
                  </div>
                )}
              </>
            )}
          </Modal.Body>

          <Modal.Footer className="flex justify-between items-center border-t border-separator pt-4">
            <span className="text-xs text-muted-foreground">
              Press Space to close or click button
            </span>
            <Button variant="primary" size="sm" onPress={handleViewFull}>
              <span>View Full Plan</span>
              <ExternalLink className="w-3.5 h-3.5 ml-1.5" />
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
