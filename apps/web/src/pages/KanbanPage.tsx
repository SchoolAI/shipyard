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
  type PlanIndexEntry,
  PlanIndexEntrySchema,
  type PlanMetadata,
  type PlanStatusType,
  type StatusTransition,
  setPlanIndexEntry,
  transitionPlanStatus,
  YDOC_KEYS,
} from '@shipyard/schema';
import { Eye, EyeOff } from 'lucide-react';
import { nanoid } from 'nanoid';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { IndexeddbPersistence } from 'y-indexeddb';
import * as Y from 'yjs';
import { AuthChoiceModal } from '@/components/AuthChoiceModal';
import { GitHubAuthOverlay } from '@/components/GitHubAuthModal';
import { OfflineBanner } from '@/components/OfflineBanner';
import { PlanContent } from '@/components/PlanContent';
import { type PanelWidth, PlanPanel } from '@/components/PlanPanel';
import { PlanPanelHeader } from '@/components/PlanPanelHeader';
import { PlanPeekModal } from '@/components/PlanPeekModal';
import { SignInModal } from '@/components/SignInModal';
import { KanbanSkeleton } from '@/components/ui/KanbanSkeleton';
import { KanbanCard } from '@/components/views/KanbanCard';
import { KanbanColumn } from '@/components/views/KanbanColumn';
import { getPlanRoute } from '@/constants/routes';
import { usePlanIndexContext } from '@/contexts/PlanIndexContext';
import { useGitHubAuth } from '@/hooks/useGitHubAuth';
import { type ColumnId, columnIdToStatus, useKanbanColumns } from '@/hooks/useKanbanColumns';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useLocalIdentity } from '@/hooks/useLocalIdentity';
import { useMultiProviderSync } from '@/hooks/useMultiProviderSync';
import { colorFromString } from '@/utils/color';
import { formatRelativeTime } from '@/utils/formatters';
import {
  getHideEmptyColumns,
  setHideEmptyColumns as saveHideEmptyColumns,
  setSidebarCollapsed,
} from '@/utils/uiPreferences';
import { assertNever } from '../utils/assert-never';

/** Type guard to validate PanelWidth values */
function isPanelWidth(value: string | null): value is PanelWidth {
  return value === 'peek' || value === 'expanded' || value === 'full';
}

/**
 * Type guard to safely extract PlanIndexEntry from drag data.
 */
function getDragPlan(
  data: { current?: { plan?: unknown } } | undefined
): PlanIndexEntry | undefined {
  const plan = data?.current?.plan;
  const result = PlanIndexEntrySchema.safeParse(plan);
  return result.success ? result.data : undefined;
}

/**
 * Determine the target column ID from a drag-drop event.
 */
function getTargetColumnId(event: DragEndEvent, allPlans: PlanIndexEntry[]): ColumnId | null {
  const { over } = event;
  if (!over) return null;

  // Dropped directly on a column
  if (over.data.current?.type === 'column') {
    const columnId = String(over.id);
    // Validate that it's a valid ColumnId
    if (
      columnId === 'draft' ||
      columnId === 'in_review' ||
      columnId === 'in_progress' ||
      columnId === 'completed'
    ) {
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
      default:
        assertNever(status);
    }
  }

  return null;
}

/**
 * Build the appropriate status transition for drag-drop operations.
 * Auto-generates required fields to prevent CRDT corruption.
 */
function buildDragDropTransition(
  newStatus: PlanStatusType,
  reviewedBy: string,
  now: number
): StatusTransition {
  switch (newStatus) {
    case 'draft':
      return { status: 'draft' };
    case 'pending_review':
      return { status: 'pending_review', reviewRequestId: nanoid() };
    case 'changes_requested':
      return { status: 'changes_requested', reviewedAt: now, reviewedBy };
    case 'in_progress':
      return { status: 'in_progress', reviewedAt: now, reviewedBy };
    case 'completed':
      return { status: 'completed', completedAt: now, completedBy: reviewedBy };
    default:
      return assertNever(newStatus);
  }
}

/**
 * Update the plan's status in both the index CRDT and the plan's own metadata.
 * Uses transitionPlanStatus for type-safe status transitions.
 */
async function updatePlanStatus(
  indexDoc: Y.Doc,
  planId: string,
  newStatus: PlanStatusType,
  reviewedBy: string
): Promise<void> {
  const now = Date.now();

  // Update in plan-index CRDT (always succeeds for UI consistency)
  const entry = getPlanIndexEntry(indexDoc, planId);
  if (entry) {
    setPlanIndexEntry(indexDoc, {
      ...entry,
      status: newStatus,
      updatedAt: now,
    });
  }

  // Build the appropriate transition for the target status
  const transition = buildDragDropTransition(newStatus, reviewedBy, now);

  // Also update the plan's own metadata using type-safe transition
  try {
    const planDoc = new Y.Doc();
    const idb = new IndexeddbPersistence(planId, planDoc);
    await idb.whenSynced;

    // Transition may fail if plan is in an unexpected state - that's OK for drag-drop UI
    // The index update is the UI source of truth
    transitionPlanStatus(planDoc, transition);

    idb.destroy();
  } catch {
    // Plan doc may not exist locally - index update is sufficient
  }
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: page component orchestrates multiple state machines
export function KanbanPage() {
  const { identity: githubIdentity, startAuth, authState } = useGitHubAuth();
  const { localIdentity, setLocalIdentity } = useLocalIdentity();
  const [showAuthChoice, setShowAuthChoice] = useState(false);
  const [showLocalSignIn, setShowLocalSignIn] = useState(false);
  // Use shared plan index context to avoid duplicate WebRTC providers
  const {
    myPlans,
    sharedPlans,
    inboxPlans,
    isLoading,
    timedOut,
    reconnect,
    isReconnecting,
    ydoc: indexDoc,
  } = usePlanIndexContext();
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
  const initialWidth: PanelWidth = isPanelWidth(rawWidth) ? rawWidth : 'peek';

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

    const metaMap = panelYdoc.getMap<PlanMetadata>(YDOC_KEYS.METADATA);
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
        e.preventDefault();
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
        const nextWidth = widths[currentIndex + 1];
        if (nextWidth !== undefined) {
          setPanelWidth(nextWidth);
        }
      } else if (direction === 'collapse' && currentIndex > 0) {
        const prevWidth = widths[currentIndex - 1];
        if (prevWidth !== undefined) {
          setPanelWidth(prevWidth);
        }
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
        setSidebarCollapsed(true);
        navigate(getPlanRoute(selectedPlanId));
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

    const now = Date.now();
    const reviewedBy = githubIdentity?.displayName || githubIdentity?.username || 'Unknown';

    // Use type-safe transition helper for plan doc
    // Transition may fail if plan is in an unexpected state - that's OK for UI
    transitionPlanStatus(
      panelYdoc,
      { status: 'in_progress', reviewedAt: now, reviewedBy },
      reviewedBy
    );

    // Also update index with the same timestamp
    const entry = getPlanIndexEntry(indexDoc, selectedPlanId);
    if (entry) {
      setPlanIndexEntry(indexDoc, {
        ...entry,
        status: 'in_progress',
        updatedAt: now,
      });
    }

    toast.success('Task approved');
  }, [selectedPlanId, panelMetadata, panelYdoc, indexDoc, githubIdentity]);

  const handleRequestChanges = useCallback(() => {
    if (!selectedPlanId) return;
    // Navigate to full plan page for adding comments
    navigate(getPlanRoute(selectedPlanId));
    toast.info('Navigate to add comments and request changes');
  }, [selectedPlanId, navigate]);

  // Identity for comments - Priority: GitHub > Local > null
  const identity = githubIdentity
    ? {
        id: githubIdentity.username,
        name: githubIdentity.displayName,
        color: colorFromString(githubIdentity.username),
      }
    : localIdentity
      ? {
          id: `local:${localIdentity.username}`,
          name: localIdentity.username,
          color: colorFromString(localIdentity.username),
        }
      : null;

  const handleRequestIdentity = useCallback(() => {
    setShowAuthChoice(true);
  }, []);

  const handleLocalSignIn = useCallback(
    (username: string) => {
      setLocalIdentity(username);
      setShowLocalSignIn(false);
    },
    [setLocalIdentity]
  );

  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200,
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
            <p className="text-sm text-muted-foreground">Loading tasks...</p>
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
      const plan = getDragPlan(active.data);
      return `Picked up task: ${plan?.title || 'unknown'}`;
    },
    onDragOver({ active, over }) {
      const plan = getDragPlan(active.data);
      if (over) {
        const columnData = over.data.current;
        const status = String(columnData?.status || columnData?.column?.id || 'unknown');
        return `Task ${plan?.title || 'unknown'} is over ${status.replace('_', ' ')} column`;
      }
      return `Task ${plan?.title || 'unknown'} is no longer over a droppable area`;
    },
    onDragEnd({ active, over }) {
      const plan = getDragPlan(active.data);
      if (over) {
        const columnData = over.data.current;
        const status = String(columnData?.status || columnData?.column?.id || 'unknown');
        return `Task ${plan?.title || 'unknown'} was moved to ${status.replace('_', ' ')} column`;
      }
      return `Drag cancelled for task: ${plan?.title || 'unknown'}`;
    },
    onDragCancel({ active }) {
      const plan = getDragPlan(active.data);
      return `Dragging was cancelled. Task ${plan?.title || 'unknown'} was not moved.`;
    },
  };

  const handleDragStart = (event: DragStartEvent) => {
    const planId = String(event.active.id);
    const plan = allPlans.find((p) => p.id === planId);
    if (plan) {
      setActivePlan(plan);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActivePlan(null);

    const planId = String(event.active.id);
    const plan = allPlans.find((p) => p.id === planId);
    if (!plan) return;

    const targetColumnId = getTargetColumnId(event, allPlans);
    if (!targetColumnId) return;

    const newStatus = columnIdToStatus(targetColumnId);
    if (plan.status === newStatus) return;

    const reviewedBy = githubIdentity?.displayName || githubIdentity?.username || 'Unknown';
    await updatePlanStatus(indexDoc, planId, newStatus, reviewedBy);
    toast.success(`Moved to ${newStatus.replace('_', ' ')}`);
  };

  const handleDragCancel = () => {
    setActivePlan(null);
  };

  // Prefer WebSocket when connected, fall back to WebRTC
  const activeProvider = panelWsProvider ?? panelRtcProvider;

  return (
    <div className="h-full flex flex-col">
      {/* Offline banner */}
      {timedOut && <OfflineBanner onRetry={reconnect} isReconnecting={isReconnecting} />}

      <header className="flex items-center justify-between px-4 py-3 border-b border-separator shrink-0">
        <div>
          <h1 className="text-xl font-bold text-foreground">Board</h1>
          <p className="text-sm text-muted-foreground">
            {allPlans.length} {allPlans.length === 1 ? 'task' : 'tasks'} across{' '}
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
                  setSidebarCollapsed(true);
                  navigate(getPlanRoute(selectedPlanId));
                }
              }}
              width={panelWidth}
            />
            <PlanContent
              mode="live"
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
              <p className="text-muted-foreground">Loading task...</p>
            </div>
          </div>
        ) : null}
      </PlanPanel>

      {/* Auth modals */}
      <GitHubAuthOverlay authState={authState} />
      <AuthChoiceModal
        isOpen={showAuthChoice}
        onOpenChange={setShowAuthChoice}
        onGitHubAuth={startAuth}
        onLocalAuth={() => setShowLocalSignIn(true)}
      />
      <SignInModal
        isOpen={showLocalSignIn}
        onClose={() => setShowLocalSignIn(false)}
        onSignIn={handleLocalSignIn}
      />
    </div>
  );
}
