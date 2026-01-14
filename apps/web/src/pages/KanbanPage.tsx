/**
 * Kanban Board Page - Visual workflow management with drag-drop status changes.
 */

import {
  type Announcements,
  closestCenter,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { Button, Tooltip } from '@heroui/react';
import type { PlanIndexEntry, PlanStatusType } from '@peer-plan/schema';
import { getPlanIndexEntry, PLAN_INDEX_DOC_NAME, setPlanIndexEntry } from '@peer-plan/schema';
import { Eye, EyeOff } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import type * as Y from 'yjs';
import { PlanPeekModal } from '@/components/PlanPeekModal';
import { KanbanSkeleton } from '@/components/ui/KanbanSkeleton';
import { KanbanCard } from '@/components/views/KanbanCard';
import { KanbanColumn } from '@/components/views/KanbanColumn';
import { useGitHubAuth } from '@/hooks/useGitHubAuth';
import { columnIdToStatus, useKanbanColumns } from '@/hooks/useKanbanColumns';
import { useMultiProviderSync } from '@/hooks/useMultiProviderSync';
import { usePlanIndex } from '@/hooks/usePlanIndex';
import {
  getHideEmptyColumns,
  setHideEmptyColumns as saveHideEmptyColumns,
} from '@/utils/uiPreferences';

/**
 * Determine the target column ID from a drag-drop event.
 */
function getTargetColumnId(event: DragEndEvent, allPlans: PlanIndexEntry[]): string | null {
  const { over } = event;
  if (!over) return null;

  // Dropped directly on a column
  if (over.data.current?.type === 'column') {
    return over.id as string;
  }

  // Dropped on a card - get the card's current status
  if (over.data.current?.type === 'plan') {
    const targetPlan = allPlans.find((p) => p.id === over.id);
    return targetPlan?.status ?? null;
  }

  return null;
}

/**
 * Update the plan's status in both the index CRDT and the plan's own metadata.
 */
async function updatePlanStatus(
  indexDoc: Y.Doc,
  planId: string,
  newStatus: PlanStatusType
): Promise<void> {
  const now = Date.now();

  // Update in plan-index CRDT
  const entry = getPlanIndexEntry(indexDoc, planId);
  if (entry) {
    setPlanIndexEntry(indexDoc, {
      ...entry,
      status: newStatus,
      updatedAt: now,
    });
  }

  // Also update the plan's own metadata
  try {
    const planDoc = new (await import('yjs')).Doc();
    const idb = new (await import('y-indexeddb')).IndexeddbPersistence(planId, planDoc);
    await idb.whenSynced;

    planDoc.transact(() => {
      const metadata = planDoc.getMap('metadata');
      metadata.set('status', newStatus);
      metadata.set('updatedAt', now);
    });

    // Brief delay to ensure IndexedDB write
    await new Promise((resolve) => setTimeout(resolve, 100));
    idb.destroy();
  } catch {
    // Plan doc may not exist locally - index update is sufficient
  }
}

export function KanbanPage() {
  const { identity: githubIdentity } = useGitHubAuth();
  const { myPlans, sharedPlans, inboxPlans, isLoading } = usePlanIndex(githubIdentity?.username);
  const { ydoc: indexDoc } = useMultiProviderSync(PLAN_INDEX_DOC_NAME);

  // Combine all plans for the board
  const allPlans = [...myPlans, ...sharedPlans, ...inboxPlans];
  const columns = useKanbanColumns(allPlans);

  const [hideEmptyColumns, setHideEmptyColumns] = useState(getHideEmptyColumns);

  const visibleColumns = useMemo(() => {
    if (hideEmptyColumns) {
      return columns.filter((col) => col.plans.length > 0);
    }
    return columns;
  }, [columns, hideEmptyColumns]);

  const handleToggleEmptyColumns = useCallback(() => {
    const newValue = !hideEmptyColumns;
    setHideEmptyColumns(newValue);
    saveHideEmptyColumns(newValue);
  }, [hideEmptyColumns]);

  const [activePlan, setActivePlan] = useState<PlanIndexEntry | null>(null);

  const [hoveredCardId, setHoveredCardId] = useState<string | null>(null);
  const [isPeeking, setIsPeeking] = useState(false);
  const [peekPlanId, setPeekPlanId] = useState<string | null>(null);

  const peekPlan = peekPlanId ? allPlans.find((p) => p.id === peekPlanId) : null;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only trigger if Space and hovering over a card, not during drag
      if (e.code === 'Space' && hoveredCardId && !activePlan) {
        // Don't trigger if typing in an input
        if (
          document.activeElement?.tagName === 'INPUT' ||
          document.activeElement?.tagName === 'TEXTAREA'
        ) {
          return;
        }
        e.preventDefault(); // Prevent page scroll
        setIsPeeking(true);
        setPeekPlanId(hoveredCardId);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' && isPeeking) {
        setIsPeeking(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [hoveredCardId, isPeeking, activePlan]);

  useEffect(() => {
    if (activePlan) {
      setIsPeeking(false);
      setPeekPlanId(null);
    }
  }, [activePlan]);

  const handleCardHover = useCallback((planId: string | null) => {
    setHoveredCardId(planId);
  }, []);

  const handleClosePeek = useCallback(() => {
    setIsPeeking(false);
  }, []);

  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 8, // Require 8px movement before drag starts
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200, // Long press to start drag on touch
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  if (isLoading) {
    return (
      <div className="h-full flex flex-col">
        <header className="flex items-center justify-between px-4 py-3 border-b border-separator shrink-0">
          <div>
            <h1 className="text-xl font-bold text-foreground">Board</h1>
            <p className="text-sm text-muted-foreground">Loading plans...</p>
          </div>
        </header>
        <div className="flex-1 overflow-x-auto overflow-y-hidden">
          <KanbanSkeleton />
        </div>
      </div>
    );
  }

  const announcements: Announcements = {
    onDragStart({ active }) {
      const plan = active.data.current?.plan as PlanIndexEntry | undefined;
      return `Picked up plan: ${plan?.title || 'unknown'}`;
    },
    onDragOver({ active, over }) {
      const plan = active.data.current?.plan as PlanIndexEntry | undefined;
      if (over) {
        const columnData = over.data.current;
        const status = (columnData?.status || columnData?.column?.id || 'unknown') as string;
        return `Plan ${plan?.title || 'unknown'} is over ${status.replace('_', ' ')} column`;
      }
      return `Plan ${plan?.title || 'unknown'} is no longer over a droppable area`;
    },
    onDragEnd({ active, over }) {
      const plan = active.data.current?.plan as PlanIndexEntry | undefined;
      if (over) {
        const columnData = over.data.current;
        const status = (columnData?.status || columnData?.column?.id || 'unknown') as string;
        return `Plan ${plan?.title || 'unknown'} was moved to ${status.replace('_', ' ')} column`;
      }
      return `Drag cancelled for plan: ${plan?.title || 'unknown'}`;
    },
    onDragCancel({ active }) {
      const plan = active.data.current?.plan as PlanIndexEntry | undefined;
      return `Dragging was cancelled. Plan ${plan?.title || 'unknown'} was not moved.`;
    },
  };

  const handleDragStart = (event: DragStartEvent) => {
    const plan = allPlans.find((p) => p.id === event.active.id);
    if (plan) {
      setActivePlan(plan);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActivePlan(null);

    const planId = event.active.id as string;
    const plan = allPlans.find((p) => p.id === planId);
    if (!plan) return;

    const targetColumnId = getTargetColumnId(event, allPlans);
    if (!targetColumnId) return;

    const newStatus = columnIdToStatus(targetColumnId);
    if (!newStatus || plan.status === newStatus) return;

    await updatePlanStatus(indexDoc, planId, newStatus);
    toast.success(`Moved to ${newStatus.replace('_', ' ')}`);
  };

  const handleDragCancel = () => {
    setActivePlan(null);
  };

  return (
    <div className="h-full flex flex-col">
      <header className="flex items-center justify-between px-4 py-3 border-b border-separator shrink-0">
        <div>
          <h1 className="text-xl font-bold text-foreground">Board</h1>
          <p className="text-sm text-muted-foreground">
            {allPlans.length} {allPlans.length === 1 ? 'plan' : 'plans'} across{' '}
            {visibleColumns.length} {visibleColumns.length === 1 ? 'column' : 'columns'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Tooltip>
            <Tooltip.Trigger>
              <Button
                isIconOnly
                variant="ghost"
                size="sm"
                onPress={handleToggleEmptyColumns}
                className={hideEmptyColumns ? 'text-accent' : ''}
              >
                {hideEmptyColumns ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              </Button>
            </Tooltip.Trigger>
            <Tooltip.Content>{hideEmptyColumns ? 'Show' : 'Hide'} empty columns</Tooltip.Content>
          </Tooltip>
        </div>
      </header>

      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
          accessibility={{ announcements }}
        >
          <div className="flex gap-4 p-4 h-full min-w-min">
            {visibleColumns.map((column) => (
              <KanbanColumn key={column.id} column={column} onCardHover={handleCardHover} />
            ))}
          </div>

          <DragOverlay>
            {activePlan ? (
              <div className="opacity-90">
                <KanbanCard plan={activePlan} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      {peekPlan && <PlanPeekModal plan={peekPlan} isOpen={isPeeking} onClose={handleClosePeek} />}
    </div>
  );
}
