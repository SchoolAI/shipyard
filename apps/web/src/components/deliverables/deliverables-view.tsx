import { Alert, Button, Chip } from '@heroui/react';
import type { TaskArtifact, TaskDeliverable, TaskId, TaskStatus } from '@shipyard/loro-schema';
import { Package } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  useTaskArtifacts,
  useTaskDeliverables,
  useTaskMeta,
} from '@/loro/selectors/task-selectors';
import { useTaskDocument } from '@/loro/use-task-document';
import { formatDateTime } from '@/utils/formatters';
import { ArtifactRenderer } from '../artifacts/artifact-renderer';
import { DeliverableCard } from './deliverable-card';

type ArtifactType = TaskArtifact[number];
type DeliverableType = TaskDeliverable[number];

interface UserIdentity {
  id: string;
  name: string;
  color: string;
}

interface DeliverablesViewProps {
  taskId: TaskId;
  identity: UserIdentity | null;
  onRequestIdentity?: () => void;
  isMobile: boolean;
}

interface EnrichedDeliverable {
  deliverable: DeliverableType;
  artifact?: ArtifactType;
}

function useDeliverablesViewState(deliverables: DeliverableType[], artifacts: ArtifactType[]) {
  const artifactMap = useMemo(() => new Map(artifacts.map((a) => [a.id, a])), [artifacts]);

  const enrichedDeliverables = useMemo<EnrichedDeliverable[]>(
    () =>
      deliverables.map((d) => ({
        deliverable: d,
        artifact: d.linkedArtifactId ? artifactMap.get(d.linkedArtifactId) : undefined,
      })),
    [deliverables, artifactMap]
  );

  const { useDeliverablesView, completedCount, totalCount } = useMemo(() => {
    const shouldUseDeliverablesView = deliverables.length > 0;
    const itemsToShow = shouldUseDeliverablesView ? enrichedDeliverables : artifacts;
    const completed = shouldUseDeliverablesView
      ? enrichedDeliverables.filter((d) => d.deliverable.linkedArtifactId).length
      : artifacts.filter((a) => a.storage === 'github' && a.url).length;
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

function EmptyState({ status }: { status: TaskStatus }) {
  const getMessage = () => {
    switch (status) {
      case 'draft':
      case 'pending_review':
      case 'changes_requested':
        return 'Deliverables will appear once the task is approved and work begins.';
      case 'in_progress':
        return 'Waiting for the agent to upload deliverables as proof of completed work.';
      case 'completed':
        return 'This task was completed without additional deliverables.';
      default: {
        const _exhaustive: never = status;
        void _exhaustive;
        return 'No deliverables yet.';
      }
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

function CompletionBanner({
  completedAt,
  completedBy,
}: {
  completedAt: number | null;
  completedBy: string | null;
}) {
  if (!completedAt || !completedBy) {
    return null;
  }

  return (
    <Alert status="success" className="mt-4">
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Title>Task completed</Alert.Title>
        <Alert.Description>
          <span>Marked complete by {completedBy}</span>
          <span className="block text-muted-foreground text-xs mt-1">
            {formatDateTime(completedAt)}
          </span>
        </Alert.Description>
      </Alert.Content>
    </Alert>
  );
}

function DeliverablesList({
  enrichedDeliverables,
  artifacts,
  useDeliverablesView,
  selectedArtifactId,
  onSelectArtifact,
  isMobile,
}: {
  enrichedDeliverables: EnrichedDeliverable[];
  artifacts: ArtifactType[];
  useDeliverablesView: boolean;
  selectedArtifactId: string | null;
  onSelectArtifact: (artifact: ArtifactType) => void;
  isMobile: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      {useDeliverablesView
        ? enrichedDeliverables
            .filter(
              (item): item is EnrichedDeliverable & { artifact: ArtifactType } =>
                item.artifact !== undefined
            )
            .map((item) => (
              <DeliverableCard
                key={item.deliverable.id}
                artifact={item.artifact}
                isSelected={selectedArtifactId === item.artifact.id}
                onSelect={!isMobile ? onSelectArtifact : undefined}
                isMobile={isMobile}
              />
            ))
        : artifacts.map((artifact) => (
            <DeliverableCard
              key={artifact.id}
              artifact={artifact}
              isSelected={selectedArtifactId === artifact.id}
              onSelect={!isMobile ? onSelectArtifact : undefined}
              isMobile={isMobile}
            />
          ))}
    </div>
  );
}

function getCompletionChipColor(
  totalCount: number,
  completedCount: number
): 'default' | 'success' | 'warning' {
  if (totalCount === 0) return 'default';
  if (completedCount === totalCount) return 'success';
  if (completedCount > 0) return 'warning';
  return 'default';
}

function StatusAlerts({
  status,
  totalCount,
  completedCount,
  useDeliverablesView,
}: {
  status: TaskStatus;
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

function ArtifactPreviewPanel({ artifact }: { artifact: ArtifactType }) {
  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-foreground">{artifact.filename}</h3>
        {artifact.description && (
          <p className="text-sm text-muted-foreground mt-1">{artifact.description}</p>
        )}
      </div>
      <ArtifactRenderer artifact={artifact} />
    </div>
  );
}

function DeliverablesListContent({
  taskId,
  totalCount,
  completedCount,
  useDeliverablesView,
  enrichedDeliverables,
  artifacts,
  selectedArtifactId,
  handleSelectArtifact,
  isMobile,
  status,
  completedAt,
  completedBy,
  canComplete,
  identity,
  onRequestIdentity,
}: {
  taskId: TaskId;
  totalCount: number;
  completedCount: number;
  useDeliverablesView: boolean;
  enrichedDeliverables: EnrichedDeliverable[];
  artifacts: ArtifactType[];
  selectedArtifactId: string | null;
  handleSelectArtifact: (artifact: ArtifactType) => void;
  isMobile: boolean;
  status: TaskStatus;
  completedAt: number | null;
  completedBy: string | null;
  canComplete: boolean;
  identity: UserIdentity | null;
  onRequestIdentity: (() => void) | undefined;
}) {
  const taskDoc = useTaskDocument(taskId);

  const handleComplete = () => {
    if (!identity) {
      toast.info('Sign in to complete this task');
      onRequestIdentity?.();
      return;
    }

    taskDoc.updateStatus('completed', identity.name);
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto p-4 md:p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-foreground">Deliverables</h2>
          <Chip color={getCompletionChipColor(totalCount, completedCount)} variant="soft" size="sm">
            {completedCount} / {totalCount} {useDeliverablesView ? 'completed' : 'attached'}
          </Chip>
        </div>

        {totalCount === 0 ? (
          <EmptyState status={status} />
        ) : (
          <DeliverablesList
            enrichedDeliverables={enrichedDeliverables}
            artifacts={artifacts}
            useDeliverablesView={useDeliverablesView}
            selectedArtifactId={selectedArtifactId}
            onSelectArtifact={handleSelectArtifact}
            isMobile={isMobile}
          />
        )}

        <StatusAlerts
          status={status}
          totalCount={totalCount}
          completedCount={completedCount}
          useDeliverablesView={useDeliverablesView}
        />

        {status === 'completed' && (
          <CompletionBanner completedAt={completedAt} completedBy={completedBy} />
        )}

        {canComplete && (
          <div className="mt-6 flex justify-end">
            <Button
              variant="primary"
              className="bg-success hover:bg-success-dark text-success-foreground"
              onPress={handleComplete}
            >
              Mark Complete
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export function DeliverablesView({
  taskId,
  identity,
  onRequestIdentity,
  isMobile,
}: DeliverablesViewProps) {
  const meta = useTaskMeta(taskId);
  const deliverables = useTaskDeliverables(taskId);
  const artifacts = useTaskArtifacts(taskId);

  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null);

  const selectedArtifact = selectedArtifactId
    ? (artifacts.find((a) => a.id === selectedArtifactId) ?? null)
    : null;

  const { enrichedDeliverables, useDeliverablesView, completedCount, totalCount } =
    useDeliverablesViewState(deliverables, artifacts);

  const canComplete = totalCount > 0 && meta.status === 'in_progress';

  const handleSelectArtifact = (artifact: ArtifactType) => {
    setSelectedArtifactId((prev) => (prev === artifact.id ? null : artifact.id));
  };

  const showSidePanel = !isMobile && selectedArtifact !== null;

  if (isMobile) {
    return (
      <DeliverablesListContent
        taskId={taskId}
        totalCount={totalCount}
        completedCount={completedCount}
        useDeliverablesView={useDeliverablesView}
        enrichedDeliverables={enrichedDeliverables}
        artifacts={artifacts}
        selectedArtifactId={selectedArtifactId}
        handleSelectArtifact={handleSelectArtifact}
        isMobile={isMobile}
        status={meta.status}
        completedAt={meta.completedAt}
        completedBy={meta.completedBy}
        canComplete={canComplete}
        identity={identity}
        onRequestIdentity={onRequestIdentity}
      />
    );
  }

  return (
    <div className="flex h-full">
      <div
        className={cn('overflow-hidden transition-all duration-300 ease-out')}
        style={{
          width: showSidePanel ? '40%' : '100%',
        }}
      >
        <DeliverablesListContent
          taskId={taskId}
          totalCount={totalCount}
          completedCount={completedCount}
          useDeliverablesView={useDeliverablesView}
          enrichedDeliverables={enrichedDeliverables}
          artifacts={artifacts}
          selectedArtifactId={selectedArtifactId}
          handleSelectArtifact={handleSelectArtifact}
          isMobile={isMobile}
          status={meta.status}
          completedAt={meta.completedAt}
          completedBy={meta.completedBy}
          canComplete={canComplete}
          identity={identity}
          onRequestIdentity={onRequestIdentity}
        />
      </div>

      {showSidePanel && (
        <>
          <div className="w-1.5 bg-separator hover:bg-primary/50 cursor-col-resize shrink-0 transition-colors duration-150" />
          <div
            className="border-l border-separator bg-surface overflow-hidden transition-all duration-300 ease-out"
            style={{ width: '60%' }}
          >
            {selectedArtifact && <ArtifactPreviewPanel artifact={selectedArtifact} />}
          </div>
        </>
      )}
    </div>
  );
}
