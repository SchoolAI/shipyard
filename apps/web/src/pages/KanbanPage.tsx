/**
 * Kanban Board Page - Visual workflow management with drag-drop status changes.
 * Includes slide-out panel for viewing plans without losing board context.
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
import { Button, Spinner, Tooltip } from '@heroui/react';
import {
  getDeliverables,
  getPlanIndexEntry,
  getPlanMetadata,
  PLAN_INDEX_DOC_NAME,
  type PlanIndexEntry,
  type PlanMetadata,
  type PlanStatusType,
  setPlanIndexEntry,
} from '@peer-plan/schema';
import { Eye, EyeOff } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { IndexeddbPersistence } from 'y-indexeddb';
import * as Y from 'yjs';
import { PlanContent } from '@/components/PlanContent';
import { type PanelWidth, PlanPanel } from '@/components/PlanPanel';
import { PlanPanelHeader } from '@/components/PlanPanelHeader';
import { PlanPeekModal } from '@/components/PlanPeekModal';
import { KanbanSkeleton } from '@/components/ui/KanbanSkeleton';
import { KanbanCard } from '@/components/views/KanbanCard';
import { KanbanColumn } from '@/components/views/KanbanColumn';
import { useGitHubAuth } from '@/hooks/useGitHubAuth';
import { type ColumnId, columnIdToStatus, useKanbanColumns } from '@/hooks/useKanbanColumns';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useMultiProviderSync } from '@/hooks/useMultiProviderSync';
import { usePlanIndex } from '@/hooks/usePlanIndex';
import { colorFromString } from '@/utils/color';
import { formatRelativeTime } from '@/utils/formatters';
import {
  getHideEmptyColumns,
  setHideEmptyColumns as saveHideEmptyColumns,
} from '@/utils/uiPreferences';

/**
 * Determine the target column ID from a drag-drop event.
 */
function getTargetColumnId(event: DragEndEvent, allPlans: PlanIndexEntry[]): ColumnId | null {
  const { over } = event;
  if (!over) return null;

  // Dropped directly on a column
  if (over.data.current?.type === 'column') {
    const columnId = over.id as string;
    // Validate that it's a valid ColumnId
    if (columnId === 'draft' || columnId === 'in_review' || columnId === 'in_progress' || columnId === 'completed') {
      return columnId;
    }
    return null;
  }

  // Dropped on a card - get the card's current status and map to column ID
  if (over.data.current?.type === 'plan') {
    const targetPlan = allPlans.find((p) => p.id === over.id);
    if (!targetPlan) return null;

    // Map status to column ID
    const status = targetPlan.status;
    switch (status) {
      case 'draft':
        return 'draft';
      case 'pending_review':
      case 'changes_requested':
        return 'in_review';
      case 'in_progress':
        return 'in_progress';
      case 'completed':
        return 'completed';
      default: {
        // Exhaustive check - this should never happen
        const _exhaustive: never = status;
        console.error('Unexpected plan status:', _exhaustive);
        return null;
      }
    }
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
    const planDoc = new Y.Doc();
    const idb = new IndexeddbPersistence(planId, planDoc);
    await idb.whenSynced;

    planDoc.transact(() => {
      const metadata = planDoc.getMap('metadata');
      metadata.set('status', newStatus);
      metadata.set('updatedAt', now);
    });

    idb.destroy();
  } catch {
    // Plan doc may not exist locally - index update is sufficient
  }
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: page component orchestrates multiple state machines
export function KanbanPage() {
  const { identity: githubIdentity, startAuth } = useGitHubAuth();
  const { myPlans, sharedPlans, inboxPlans, isLoading } = usePlanIndex(githubIdentity?.username);
  const { ydoc: indexDoc } = useMultiProviderSync(PLAN_INDEX_DOC_NAME);
  const navigate = useNavigate();
  const location = useLocation();

  // Combine all plans for the board (memoized to stabilize identity for useCallback deps)
  const allPlans = useMemo(
    () => [...myPlans, ...sharedPlans, ...inboxPlans],
    [myPlans, sharedPlans, inboxPlans]
  );
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

  // Space bar peek preview state
  const [hoveredCardId, setHoveredCardId] = useState<string | null>(null);
  const [isPeeking, setIsPeeking] = useState(false);
  const [peekPlanId, setPeekPlanId] = useState<string | null>(null);

  // Slide-out panel state - read from URL on mount
  const searchParams = new URLSearchParams(location.search);
  const initialPanelId = searchParams.get('panel');
  const rawWidth = searchParams.get('width');
  const validWidths: PanelWidth[] = ['peek', 'expanded', 'full'];
  const initialWidth: PanelWidth = validWidths.includes(rawWidth as PanelWidth)
    ? (rawWidth as PanelWidth)
    : 'peek';

  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(initialPanelId);
  const [panelWidth, setPanelWidth] = useState<PanelWidth>(initialWidth);

  // Plan data for panel
  const [panelMetadata, setPanelMetadata] = useState<PlanMetadata | null>(null);
  const [panelDeliverableStats, setPanelDeliverableStats] = useState({ completed: 0, total: 0 });
  const [panelLastActivity, setPanelLastActivity] = useState('');

  // Sync providers for selected plan
  const {
    ydoc: panelYdoc,
    syncState: panelSyncState,
    wsProvider: panelWsProvider,
    rtcProvider: panelRtcProvider,
  } = useMultiProviderSync(selectedPlanId || '');

  // Update URL when panel state changes
  useEffect(() => {
    if (selectedPlanId) {
      navigate(`?panel=${selectedPlanId}&width=${panelWidth}`, { replace: true });
    } else {
      navigate('', { replace: true });
    }
  }, [selectedPlanId, panelWidth, navigate]);

  // Load panel metadata when plan is selected
  useEffect(() => {
    if (!selectedPlanId || !panelSyncState.idbSynced) {
      setPanelMetadata(null);
      return;
    }

    const metaMap = panelYdoc.getMap('metadata');
    const update = () => {
      const metadata = getPlanMetadata(panelYdoc);
      setPanelMetadata(metadata);

      // Update deliverable stats
      const deliverables = getDeliverables(panelYdoc);
      const completed = deliverables.filter((d) => d.linkedArtifactId).length;
      setPanelDeliverableStats({ completed, total: deliverables.length });

      // Format last activity
      if (metadata?.updatedAt) {
        setPanelLastActivity(`Updated ${formatRelativeTime(metadata.updatedAt)}`);
      }
    };
    update();
    metaMap.observe(update);
    return () => metaMap.unobserve(update);
  }, [selectedPlanId, panelYdoc, panelSyncState.idbSynced]);

  const peekPlan = peekPlanId ? allPlans.find((p) => p.id === peekPlanId) : null;

  // Space bar peek handlers
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

  // Panel handlers
  const handleCardClick = useCallback((planId: string) => {
    setSelectedPlanId(planId);
    setPanelWidth('peek');
  }, []);

  const handleClosePanel = useCallback(() => {
    setSelectedPlanId(null);
  }, []);

  const handleChangeWidth = useCallback((width: PanelWidth) => {
    setPanelWidth(width);
  }, []);

  // Panel width cycling
  const cycleWidth = useCallback(
    (direction: 'expand' | 'collapse') => {
      const widths: PanelWidth[] = ['peek', 'expanded', 'full'];
      const currentIndex = widths.indexOf(panelWidth);
      if (direction === 'expand' && currentIndex < widths.length - 1) {
        setPanelWidth(widths[currentIndex + 1] as PanelWidth);
      } else if (direction === 'collapse' && currentIndex > 0) {
        setPanelWidth(widths[currentIndex - 1] as PanelWidth);
      }
    },
    [panelWidth]
  );

  // Keyboard shortcuts for panel
  useKeyboardShortcuts({
    onTogglePanel: useCallback(() => {
      if (selectedPlanId) {
        cycleWidth('collapse');
      }
    }, [selectedPlanId, cycleWidth]),
    onExpandPanel: useCallback(() => {
      if (selectedPlanId) {
        cycleWidth('expand');
      }
    }, [selectedPlanId, cycleWidth]),
    onFullScreen: useCallback(() => {
      if (selectedPlanId) {
        navigate(`/plan/${selectedPlanId}`);
      }
    }, [selectedPlanId, navigate]),
    onClose: handleClosePanel,
    onNextItem: useCallback(() => {
      if (!selectedPlanId) return;
      const currentIndex = allPlans.findIndex((p) => p.id === selectedPlanId);
      if (currentIndex < allPlans.length - 1) {
        const nextPlan = allPlans[currentIndex + 1];
        if (nextPlan) {
          setSelectedPlanId(nextPlan.id);
        }
      }
    }, [selectedPlanId, allPlans]),
    onPrevItem: useCallback(() => {
      if (!selectedPlanId) return;
      const currentIndex = allPlans.findIndex((p) => p.id === selectedPlanId);
      if (currentIndex > 0) {
        const prevPlan = allPlans[currentIndex - 1];
        if (prevPlan) {
          setSelectedPlanId(prevPlan.id);
        }
      }
    }, [selectedPlanId, allPlans]),
  });

  // Review action handlers
  const handleApprove = useCallback(async () => {
    if (!selectedPlanId || !panelMetadata) return;

    panelYdoc.transact(() => {
      const metadata = panelYdoc.getMap('metadata');
      metadata.set('status', 'in_progress');
      metadata.set('updatedAt', Date.now());
    });

    // Also update index
    const entry = getPlanIndexEntry(indexDoc, selectedPlanId);
    if (entry) {
      setPlanIndexEntry(indexDoc, {
        ...entry,
        status: 'in_progress',
        updatedAt: Date.now(),
      });
    }

    toast.success('Plan approved');
  }, [selectedPlanId, panelMetadata, panelYdoc, indexDoc]);

  const handleRequestChanges = useCallback(() => {
    if (!selectedPlanId) return;
    // Navigate to full plan page for adding comments
    navigate(`/plan/${selectedPlanId}`);
    toast.info('Navigate to add comments and request changes');
  }, [selectedPlanId, navigate]);

  // Identity for comments
  const identity = githubIdentity
    ? {
        id: githubIdentity.username,
        name: githubIdentity.displayName,
        color: colorFromString(githubIdentity.username),
      }
    : null;

  const handleRequestIdentity = useCallback(() => {
    startAuth();
  }, [startAuth]);

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
    if (plan.status === newStatus) return;

    await updatePlanStatus(indexDoc, planId, newStatus);
    toast.success(`Moved to ${newStatus.replace('_', ' ')}`);
  };

  const handleDragCancel = () => {
    setActivePlan(null);
  };

  // Prefer WebSocket when connected, fall back to WebRTC
  const activeProvider = panelWsProvider ?? panelRtcProvider;

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
              <KanbanColumn
                key={column.id}
                column={column}
                onCardHover={handleCardHover}
                onCardClick={handleCardClick}
              />
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

      {/* Space bar peek modal */}
      {peekPlan && <PlanPeekModal plan={peekPlan} isOpen={isPeeking} onClose={handleClosePeek} />}

      {/* Slide-out panel */}
      <PlanPanel
        planId={selectedPlanId}
        width={panelWidth}
        onClose={handleClosePanel}
        onChangeWidth={handleChangeWidth}
      >
        {selectedPlanId && panelMetadata ? (
          <>
            <PlanPanelHeader
              metadata={panelMetadata}
              deliverableStats={panelDeliverableStats}
              lastActivityText={panelLastActivity}
              onApprove={handleApprove}
              onRequestChanges={handleRequestChanges}
              onClose={handleClosePanel}
              onExpand={() => cycleWidth(panelWidth === 'peek' ? 'expand' : 'collapse')}
              onFullScreen={() => {
                if (selectedPlanId) {
                  navigate(`/plan/${selectedPlanId}`);
                }
              }}
              width={panelWidth}
            />
            <PlanContent
              ydoc={panelYdoc}
              metadata={panelMetadata}
              syncState={panelSyncState}
              identity={identity}
              onRequestIdentity={handleRequestIdentity}
              provider={activeProvider}
            />
          </>
        ) : selectedPlanId ? (
          <div className="flex items-center justify-center h-full">
            <div className="flex flex-col items-center gap-4">
              <Spinner size="lg" />
              <p className="text-muted-foreground">Loading plan...</p>
            </div>
          </div>
        ) : null}
      </PlanPanel>
    </div>
  );
}
