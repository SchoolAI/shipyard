import { Alert, Button, Chip } from '@heroui/react';
import {
  type Artifact,
  type Deliverable,
  getArtifacts,
  getDeliverables,
  type PlanMetadata,
  YDOC_KEYS,
} from '@peer-plan/schema';
import { Package } from 'lucide-react';
import { useEffect, useState } from 'react';
import type * as Y from 'yjs';
import type { UserIdentity } from '@/utils/identity';
import { DeliverableCard } from './DeliverableCard';

interface DeliverablesViewProps {
  ydoc: Y.Doc;
  metadata: PlanMetadata;
  identity: UserIdentity | null;
  onRequestIdentity: () => void;
}

/**
 * Hook to subscribe to artifacts from Y.Doc.
 */
function useArtifacts(ydoc: Y.Doc): Artifact[] {
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);

  useEffect(() => {
    const array = ydoc.getArray(YDOC_KEYS.ARTIFACTS);

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
    const array = ydoc.getArray(YDOC_KEYS.DELIVERABLES);

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
 * Empty state component when no deliverables exist.
 */
function EmptyState({ status }: { status: PlanMetadata['status'] }) {
  const getMessage = () => {
    switch (status) {
      case 'draft':
        return 'Deliverables will appear once the plan is approved and work begins.';
      case 'pending_review':
        return 'Deliverables will appear once the plan is approved and work begins.';
      case 'approved':
        return 'The agent will upload deliverables as proof of completed work.';
      case 'in_progress':
        return 'Waiting for the agent to upload deliverables as proof of completed work.';
      case 'changes_requested':
        return 'Deliverables will appear once the plan is approved and work begins.';
      case 'completed':
        return 'This task was completed without additional deliverables.';
      default:
        return 'Deliverables are added when the agent uploads artifacts.';
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
  const completedDate = metadata.completedAt
    ? new Date(metadata.completedAt).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  return (
    <Alert status="success" className="mt-4">
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Title>Task completed</Alert.Title>
        <Alert.Description>
          {metadata.completedBy && <span>Marked complete by {metadata.completedBy}</span>}
          {completedDate && (
            <span className="block text-muted-foreground text-xs mt-1">{completedDate}</span>
          )}
        </Alert.Description>
      </Alert.Content>
    </Alert>
  );
}

/**
 * Deliverables view showing all deliverables with linked artifacts.
 * Allows marking the task as complete when in_progress with attached artifacts.
 */
export function DeliverablesView({
  ydoc,
  metadata,
  identity,
  onRequestIdentity,
}: DeliverablesViewProps) {
  const deliverables = useDeliverables(ydoc);
  const artifacts = useArtifacts(ydoc);

  // Create map of artifactId → artifact for fast lookup
  const artifactMap = new Map(artifacts.map((a) => [a.id, a]));

  // Enrich deliverables with artifact data
  const enrichedDeliverables: EnrichedDeliverable[] = deliverables.map((d) => ({
    deliverable: d,
    artifact: d.linkedArtifactId ? artifactMap.get(d.linkedArtifactId) : undefined,
  }));

  // Determine what to show: deliverables or fall back to artifacts
  const useDeliverablesView = deliverables.length > 0;
  const itemsToShow = useDeliverablesView ? enrichedDeliverables : artifacts;
  const completedCount = useDeliverablesView
    ? enrichedDeliverables.filter((d) => d.deliverable.linkedArtifactId).length
    : artifacts.filter((a) => a.url).length;
  const totalCount = itemsToShow.length;

  const canComplete = totalCount > 0 && metadata.status === 'in_progress';

  const handleComplete = () => {
    if (!identity) {
      onRequestIdentity();
      return;
    }

    // Update Y.Doc to mark as completed
    ydoc.transact(() => {
      const metadataMap = ydoc.getMap('metadata');
      metadataMap.set('status', 'completed');
      metadataMap.set('completedAt', Date.now());
      metadataMap.set('completedBy', identity.displayName);
      metadataMap.set('updatedAt', Date.now());
    });
  };

  // Determine chip color based on completion status
  const getChipColor = () => {
    if (totalCount === 0) return 'default';
    if (completedCount === totalCount) return 'success';
    if (completedCount > 0) return 'warning';
    return 'default';
  };

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6">
      {/* Header with count */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-foreground">Deliverables</h2>
        <Chip color={getChipColor()} variant="soft" size="sm">
          {completedCount} / {totalCount} {useDeliverablesView ? 'completed' : 'attached'}
        </Chip>
      </div>

      {/* Empty state OR list */}
      {totalCount === 0 ? (
        <EmptyState status={metadata.status} />
      ) : (
        <div className="flex flex-col gap-3">
          {useDeliverablesView
            ? enrichedDeliverables.map((item) => {
                // Create a synthetic artifact for the DeliverableCard
                const syntheticArtifact: Artifact = item.artifact || {
                  id: item.deliverable.id,
                  type: 'screenshot', // default type for unlinked deliverables
                  filename: '',
                  description: item.deliverable.text,
                  url: undefined,
                  uploadedAt: item.deliverable.linkedAt,
                };

                return <DeliverableCard key={item.deliverable.id} artifact={syntheticArtifact} />;
              })
            : artifacts.map((artifact) => (
                <DeliverableCard key={artifact.id} artifact={artifact} />
              ))}
        </div>
      )}

      {/* Status alerts */}
      {metadata.status === 'in_progress' && totalCount === 0 && (
        <Alert status="warning" className="mt-4">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Waiting for deliverables</Alert.Title>
            <Alert.Description>
              The agent will upload artifacts as proof of completed work.
            </Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      {metadata.status === 'in_progress' && completedCount > 0 && completedCount === totalCount && (
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
      )}

      {metadata.status === 'in_progress' && completedCount > 0 && completedCount < totalCount && (
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
      )}

      {/* Completion banner (if already completed) */}
      {metadata.status === 'completed' && <CompletionBanner metadata={metadata} />}

      {/* Mark Complete button (if in_progress with items) */}
      {canComplete && (
        <div className="mt-6 flex justify-end">
          <Button
            variant="primary"
            className="bg-success hover:bg-success-dark text-white"
            onPress={handleComplete}
          >
            Mark Complete
          </Button>
        </div>
      )}
    </div>
  );
}
