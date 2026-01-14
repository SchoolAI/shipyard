/**
 * Kanban Board Page - Visual workflow management with drag-drop status changes.
 */

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { PlanIndexEntry, PlanStatusType } from '@peer-plan/schema';
import { getPlanIndexEntry, PLAN_INDEX_DOC_NAME, setPlanIndexEntry } from '@peer-plan/schema';
import { useState } from 'react';
import { toast } from 'sonner';
import type * as Y from 'yjs';
import { KanbanCard } from '@/components/views/KanbanCard';
import { KanbanColumn } from '@/components/views/KanbanColumn';
import { useGitHubAuth } from '@/hooks/useGitHubAuth';
import { columnIdToStatus, useKanbanColumns } from '@/hooks/useKanbanColumns';
import { useMultiProviderSync } from '@/hooks/useMultiProviderSync';
import { usePlanIndex } from '@/hooks/usePlanIndex';

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
  const { myPlans, sharedPlans, inboxPlans } = usePlanIndex(githubIdentity?.username);
  const { ydoc: indexDoc } = useMultiProviderSync(PLAN_INDEX_DOC_NAME);

  // Combine all plans for the board
  const allPlans = [...myPlans, ...sharedPlans, ...inboxPlans];
  const columns = useKanbanColumns(allPlans);

  // Track actively dragged plan for overlay
  const [activePlan, setActivePlan] = useState<PlanIndexEntry | null>(null);

  // Configure sensors for mouse and touch
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
    })
  );

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
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-separator shrink-0">
        <div>
          <h1 className="text-xl font-bold text-foreground">Board</h1>
          <p className="text-sm text-muted-foreground">
            {allPlans.length} {allPlans.length === 1 ? 'plan' : 'plans'} across{' '}
            {columns.filter((c) => c.plans.length > 0).length} columns
          </p>
        </div>
      </header>

      {/* Kanban Board */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <div className="flex gap-4 p-4 h-full min-w-min">
            {columns.map((column) => (
              <KanbanColumn key={column.id} column={column} />
            ))}
          </div>

          {/* Drag overlay - shows card being dragged */}
          <DragOverlay>
            {activePlan ? (
              <div className="opacity-90">
                <KanbanCard plan={activePlan} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>
    </div>
  );
}
