import { Alert, Button, Chip } from '@heroui/react';
import {
  type Artifact,
  type Deliverable,
  getArtifacts,
  getDeliverables,
  type PlanMetadata,
  transitionPlanStatus,
  YDOC_KEYS,
} from '@shipyard/schema';
import { Package } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import type * as Y from 'yjs';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useResizablePanels } from '@/hooks/useResizablePanels';
import { cn } from '@/lib/utils';
import { assertNever } from '@/utils/assert-never';
import { ArtifactPreviewPanel } from './ArtifactPreviewPanel';
import { DeliverableCard } from './DeliverableCard';

/** Simple identity type for display purposes */
interface UserIdentity {
  id: string;
  name: string;
  color: string;
}

interface DeliverablesViewProps {
  ydoc: Y.Doc;
  metadata: PlanMetadata;
  identity: UserIdentity | null;
  onRequestIdentity?: () => void;
  registryPort: number | null;
}

/**
 * Hook to subscribe to artifacts from Y.Doc.
 */
function useArtifacts(ydoc: Y.Doc): Artifact[] {
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);

  useEffect(() => {
    const array = ydoc.getArray<Artifact>(YDOC_KEYS.ARTIFACTS);

    const updateArtifacts = () => {
      setArtifacts(getArtifacts(ydoc));
    };

    updateArtifacts();
    array.observe(updateArtifacts);
    return () => array.unobserve(updateArtifacts);
  }, [ydoc]);

  return artifacts;
}

/**
 * Hook to subscribe to deliverables from Y.Doc.
 */
function useDeliverables(ydoc: Y.Doc): Deliverable[] {
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);

  useEffect(() => {
    const array = ydoc.getArray<Deliverable>(YDOC_KEYS.DELIVERABLES);

    const updateDeliverables = () => {
      setDeliverables(getDeliverables(ydoc));
    };

    updateDeliverables();
    array.observe(updateDeliverables);
    return () => array.unobserve(updateDeliverables);
  }, [ydoc]);

  return deliverables;
}

/**
 * Enriched deliverable with linked artifact data.
 */
interface EnrichedDeliverable {
  deliverable: Deliverable;
  artifact?: Artifact;
}

/**
 * Hook to compute derived deliverables view state with memoization.
 * Prevents unnecessary re-renders by caching expensive calculations.
 */
function useDeliverablesViewState(deliverables: Deliverable[], artifacts: Artifact[]) {
  /** Create memoized map of artifactId -> artifact for fast lookup */
  const artifactMap = useMemo(() => new Map(artifacts.map((a) => [a.id, a])), [artifacts]);

  /** Enrich deliverables with artifact data (memoized) */
  const enrichedDeliverables = useMemo<EnrichedDeliverable[]>(
    () =>
      deliverables.map((d) => ({
        deliverable: d,
        artifact: d.linkedArtifactId ? artifactMap.get(d.linkedArtifactId) : undefined,
      })),
    [deliverables, artifactMap]
  );

  /** Compute derived counts and flags (memoized) */
  const { useDeliverablesView, completedCount, totalCount } = useMemo(() => {
    const shouldUseDeliverablesView = deliverables.length > 0;
    const itemsToShow = shouldUseDeliverablesView ? enrichedDeliverables : artifacts;
    const completed = shouldUseDeliverablesView
      ? enrichedDeliverables.filter((d) => d.deliverable.linkedArtifactId).length
      : artifacts.filter((a) => (a.storage === 'github' ? a.url : a.localArtifactId)).length;
    const total = itemsToShow.length;

    return {
      useDeliverablesView: shouldUseDeliverablesView,
      completedCount: completed,
      totalCount: total,
    };
  }, [deliverables.length, enrichedDeliverables, artifacts]);

  return {
    enrichedDeliverables,
    useDeliverablesView,
    completedCount,
    totalCount,
  };
}

/**
 * Empty state component when no deliverables exist.
 */
function EmptyState({ status }: { status: PlanMetadata['status'] }) {
  const getMessage = () => {
    switch (status) {
      case 'draft':
        return 'Deliverables will appear once the task is approved and work begins.';
      case 'pending_review':
        return 'Deliverables will appear once the task is approved and work begins.';
      case 'in_progress':
        return 'Waiting for the agent to upload deliverables as proof of completed work.';
      case 'changes_requested':
        return 'Deliverables will appear once the task is approved and work begins.';
      case 'completed':
        return 'This task was completed without additional deliverables.';
      default:
        assertNever(status);
    }
  };

  return (
    <div className="text-center py-12 px-4">
      <Package className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
      <h3 className="text-lg font-medium text-foreground mb-2">No deliverables yet</h3>
      <p className="text-muted-foreground text-sm max-w-sm mx-auto">{getMessage()}</p>
    </div>
  );
}

/**
 * Completion banner shown when task is already completed.
 */
function CompletionBanner({ metadata }: { metadata: PlanMetadata }) {
  if (metadata.status !== 'completed') {
    return null;
  }

  const completedDate = new Date(metadata.completedAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <Alert status="success" className="mt-4">
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Title>Task completed</Alert.Title>
        <Alert.Description>
          <span>Marked complete by {metadata.completedBy}</span>
          <span className="block text-muted-foreground text-xs mt-1">{completedDate}</span>
        </Alert.Description>
      </Alert.Content>
    </Alert>
  );
}

/**
 * List of deliverable cards with selection support.
 * Only renders cards for deliverables that have linked artifacts.
 */
function DeliverablesList({
  enrichedDeliverables,
  artifacts,
  useDeliverablesView,
  selectedArtifactId,
  onSelectArtifact,
  registryPort,
  isMobile,
}: {
  enrichedDeliverables: EnrichedDeliverable[];
  artifacts: Artifact[];
  useDeliverablesView: boolean;
  selectedArtifactId: string | null;
  onSelectArtifact: (artifact: Artifact) => void;
  registryPort: number | null;
  isMobile: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      {useDeliverablesView
        ? enrichedDeliverables
            .filter(
              (item): item is EnrichedDeliverable & { artifact: Artifact } =>
                item.artifact !== undefined
            )
            .map((item) => (
              <DeliverableCard
                key={item.deliverable.id}
                artifact={item.artifact}
                registryPort={registryPort}
                isSelected={selectedArtifactId === item.artifact.id}
                onSelect={!isMobile ? onSelectArtifact : undefined}
              />
            ))
        : artifacts.map((artifact) => (
            <DeliverableCard
              key={artifact.id}
              artifact={artifact}
              registryPort={registryPort}
              isSelected={selectedArtifactId === artifact.id}
              onSelect={!isMobile ? onSelectArtifact : undefined}
            />
          ))}
    </div>
  );
}

/**
 * Get chip color based on completion count.
 */
function getCompletionChipColor(
  totalCount: number,
  completedCount: number
): 'default' | 'success' | 'warning' {
  if (totalCount === 0) return 'default';
  if (completedCount === totalCount) return 'success';
  if (completedCount > 0) return 'warning';
  return 'default';
}

/**
 * Deliverables list content with header, alerts, and actions.
 */
function DeliverablesListContent({
  totalCount,
  completedCount,
  useDeliverablesView,
  enrichedDeliverables,
  artifacts,
  selectedArtifactId,
  handleSelectArtifact,
  registryPort,
  isMobile,
  metadata,
  canComplete,
  ydoc,
  identity,
  onRequestIdentity,
}: {
  totalCount: number;
  completedCount: number;
  useDeliverablesView: boolean;
  enrichedDeliverables: EnrichedDeliverable[];
  artifacts: Artifact[];
  selectedArtifactId: string | null;
  handleSelectArtifact: (artifact: Artifact) => void;
  registryPort: number | null;
  isMobile: boolean;
  metadata: PlanMetadata;
  canComplete: boolean;
  ydoc: Y.Doc;
  identity: UserIdentity | null;
  onRequestIdentity: (() => void) | undefined;
}) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto p-4 md:p-6">
        {/* Header with count */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-foreground">Deliverables</h2>
          <Chip color={getCompletionChipColor(totalCount, completedCount)} variant="soft" size="sm">
            {completedCount} / {totalCount} {useDeliverablesView ? 'completed' : 'attached'}
          </Chip>
        </div>

        {/* Empty state OR list */}
        {totalCount === 0 ? (
          <EmptyState status={metadata.status} />
        ) : (
          <DeliverablesList
            enrichedDeliverables={enrichedDeliverables}
            artifacts={artifacts}
            useDeliverablesView={useDeliverablesView}
            selectedArtifactId={selectedArtifactId}
            onSelectArtifact={handleSelectArtifact}
            registryPort={registryPort}
            isMobile={isMobile}
          />
        )}

        {/* Status alerts */}
        <StatusAlerts
          status={metadata.status}
          totalCount={totalCount}
          completedCount={completedCount}
          useDeliverablesView={useDeliverablesView}
        />

        {/* Completion banner */}
        <CompletionBanner metadata={metadata} />

        {/* Mark Complete button */}
        {canComplete && (
          <div className="mt-6 flex justify-end">
            <Button
              variant="primary"
              className="bg-success hover:bg-success-dark text-white"
              onPress={() => handleTaskCompletion(ydoc, identity, onRequestIdentity)}
            >
              Mark Complete
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Handle task completion with identity check.
 */
function handleTaskCompletion(
  ydoc: Y.Doc,
  identity: UserIdentity | null,
  onRequestIdentity: (() => void) | undefined
) {
  if (!identity) {
    toast.info('Sign in to complete this task');
    onRequestIdentity?.();
    return;
  }

  transitionPlanStatus(
    ydoc,
    {
      status: 'completed',
      completedAt: Date.now(),
      completedBy: identity.name,
    },
    identity.name
  );
}

/**
 * Status alerts shown based on deliverable completion state.
 */
function StatusAlerts({
  status,
  totalCount,
  completedCount,
  useDeliverablesView,
}: {
  status: PlanMetadata['status'];
  totalCount: number;
  completedCount: number;
  useDeliverablesView: boolean;
}) {
  if (status !== 'in_progress') return null;

  if (totalCount === 0) {
    return (
      <Alert status="warning" className="mt-4">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>Waiting for deliverables</Alert.Title>
          <Alert.Description>
            The agent will upload artifacts as proof of completed work.
          </Alert.Description>
        </Alert.Content>
      </Alert>
    );
  }

  if (completedCount > 0 && completedCount === totalCount) {
    return (
      <Alert status="success" className="mt-4">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>Ready to complete</Alert.Title>
          <Alert.Description>
            All deliverables {useDeliverablesView ? 'completed' : 'attached'}. You can mark this
            task as complete.
          </Alert.Description>
        </Alert.Content>
      </Alert>
    );
  }

  if (completedCount > 0 && completedCount < totalCount) {
    return (
      <Alert status="accent" className="mt-4">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>Partial deliverables</Alert.Title>
          <Alert.Description>
            {completedCount} of {totalCount} deliverables{' '}
            {useDeliverablesView ? 'completed' : 'attached'}. Waiting for remaining uploads.
          </Alert.Description>
        </Alert.Content>
      </Alert>
    );
  }

  return null;
}

/**
 * Deliverables view showing all deliverables with linked artifacts.
 * Allows marking the task as complete when in_progress with attached artifacts.
 *
 * Desktop: Side-by-side layout with artifact preview panel
 * Mobile: Inline expansion (current behavior)
 */
export function DeliverablesView({
  ydoc,
  metadata,
  identity,
  onRequestIdentity,
  registryPort,
}: DeliverablesViewProps) {
  const isMobile = useIsMobile();
  const deliverables = useDeliverables(ydoc);
  const artifacts = useArtifacts(ydoc);

  /**
   * Selected artifact ID for side panel (desktop only).
   * We store ID (not the Artifact object) to avoid stale references if the artifact is deleted.
   */
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null);

  /** Derive actual artifact from reactive artifacts array */
  const selectedArtifact = selectedArtifactId
    ? (artifacts.find((a) => a.id === selectedArtifactId) ?? null)
    : null;

  /** Draggable divider state with keyboard accessibility */
  const {
    containerRef,
    leftWidthPercent: listWidthPercent,
    isDragging,
    handleDragStart,
    handleKeyDown,
  } = useResizablePanels(33);

  /** Compute derived deliverables view state */
  const { enrichedDeliverables, useDeliverablesView, completedCount, totalCount } =
    useDeliverablesViewState(deliverables, artifacts);

  const canComplete = totalCount > 0 && metadata.status === 'in_progress';

  /** Handle artifact selection for side panel */
  const handleSelectArtifact = (artifact: Artifact) => {
    setSelectedArtifactId((prev) => (prev === artifact.id ? null : artifact.id));
  };

  /** Whether to show side panel (desktop with selection) */
  const showSidePanel = !isMobile && selectedArtifact !== null;

  /** Mobile: no side panel, just the list */
  if (isMobile) {
    return (
      <DeliverablesListContent
        totalCount={totalCount}
        completedCount={completedCount}
        useDeliverablesView={useDeliverablesView}
        enrichedDeliverables={enrichedDeliverables}
        artifacts={artifacts}
        selectedArtifactId={selectedArtifactId}
        handleSelectArtifact={handleSelectArtifact}
        registryPort={registryPort}
        isMobile={isMobile}
        metadata={metadata}
        canComplete={canComplete}
        ydoc={ydoc}
        identity={identity}
        onRequestIdentity={onRequestIdentity}
      />
    );
  }

  /** Desktop: CSS-based layout with smooth slide animation + draggable divider */
  return (
    <div ref={containerRef} className="flex h-full">
      {/* Deliverable list - animates width when panel opens, draggable when open */}
      <div
        className={cn('overflow-hidden', !isDragging && 'transition-all duration-300 ease-out')}
        style={{
          width: showSidePanel ? `${listWidthPercent}%` : '100%',
        }}
      >
        <DeliverablesListContent
          totalCount={totalCount}
          completedCount={completedCount}
          useDeliverablesView={useDeliverablesView}
          enrichedDeliverables={enrichedDeliverables}
          artifacts={artifacts}
          selectedArtifactId={selectedArtifactId}
          handleSelectArtifact={handleSelectArtifact}
          registryPort={registryPort}
          isMobile={isMobile}
          metadata={metadata}
          canComplete={canComplete}
          ydoc={ydoc}
          identity={identity}
          onRequestIdentity={onRequestIdentity}
        />
      </div>

      {/* Draggable divider - only visible when panel is open */}
      {showSidePanel && (
        <div
          role="slider"
          tabIndex={0}
          className={cn(
            'w-1.5 bg-separator hover:bg-primary/50 cursor-col-resize shrink-0',
            'transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-primary',
            isDragging && 'bg-primary/50'
          )}
          onMouseDown={handleDragStart}
          onKeyDown={handleKeyDown}
          aria-label="Resize panels. Use left and right arrow keys to adjust."
          aria-orientation="vertical"
          aria-valuemin={20}
          aria-valuemax={80}
          aria-valuenow={Math.round(listWidthPercent)}
        />
      )}

      {/* Artifact preview panel - slides in from right */}
      <div
        className={cn(
          'border-l border-separator bg-surface overflow-hidden',
          !isDragging && 'transition-all duration-300 ease-out',
          !showSidePanel && 'w-0 opacity-0'
        )}
        style={{
          width: showSidePanel ? `${100 - listWidthPercent}%` : undefined,
          opacity: showSidePanel ? 1 : undefined,
        }}
      >
        {selectedArtifact && (
          <ArtifactPreviewPanel artifact={selectedArtifact} registryPort={registryPort} />
        )}
      </div>
    </div>
  );
}
