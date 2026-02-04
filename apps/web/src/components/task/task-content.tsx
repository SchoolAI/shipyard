import { isTaskStatus, type TaskId, type TaskMeta } from '@shipyard/loro-schema';
import { Clock, FileText, GitPullRequest, Package } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityTimeline } from '@/components/activity/activity-timeline';
import { Attachments } from '@/components/artifacts/attachments';
import { ChangesHeaderControls } from '@/components/changes-header-controls';
import { ChangesView, type ChangesViewState } from '@/components/changes-view';
import { PlanViewerWithComments } from '@/components/comments/plan-viewer-with-comments';
import { DeliverablesView } from '@/components/deliverables/deliverables-view';
import { VersionSelector } from '@/components/version-selector';
import { useIsMobile } from '@/hooks/use-is-mobile';
import { useVersionNavigation, type VersionNavigationState } from '@/hooks/use-version-navigation';
import { useTaskDeliverables, useTaskMeta } from '@/loro/selectors/task-selectors';

export type TaskViewTab = 'plan' | 'activity' | 'deliverables' | 'changes';

interface UserIdentity {
  id: string;
  name: string;
  color: string;
}

interface TaskContentProps {
  taskId: TaskId;
  identity: UserIdentity | null;
  onRequestIdentity?: () => void;
  initialTab?: TaskViewTab;
  onTabChange?: (tab: TaskViewTab) => void;
  readOnly?: boolean;
}

function isValidTab(value: string): value is TaskViewTab {
  return (
    value === 'plan' || value === 'activity' || value === 'deliverables' || value === 'changes'
  );
}

function useDeliverableCount(taskId: TaskId): {
  completed: number;
  total: number;
} {
  const deliverables = useTaskDeliverables(taskId);

  return useMemo(() => {
    const total = deliverables.length;
    const completed = deliverables.filter((d) => d.linkedArtifactId).length;
    return { completed, total };
  }, [deliverables]);
}

interface TabNavigationBarProps {
  activeView: TaskViewTab;
  onTabChange: (tab: TaskViewTab) => void;
  deliverableCount: { completed: number; total: number };
  changesViewState: ChangesViewState | null;
  meta: TaskMeta;
  versionNav: VersionNavigationState;
}

function TabNavigationBar({
  activeView,
  onTabChange,
  deliverableCount,
  changesViewState,
  meta,
  versionNav,
}: TabNavigationBarProps) {
  const showChangesControls = activeView === 'changes' && changesViewState !== null;

  const showVersionSelector = activeView === 'plan' && versionNav.snapshots.length > 0;

  return (
    <div className="border-b border-separator bg-surface px-2 md:px-6 shrink-0">
      <div className="flex items-center justify-between pt-1 md:pt-2">
        <div className="flex gap-0 md:gap-4 overflow-x-auto md:overflow-visible">
          <TabButton
            tab="plan"
            activeView={activeView}
            onClick={onTabChange}
            icon={<FileText className="w-3.5 h-3.5 md:w-4 md:h-4" />}
            label="Plan"
          />
          <TabButton
            tab="deliverables"
            activeView={activeView}
            onClick={onTabChange}
            icon={<Package className="w-3.5 h-3.5 md:w-4 md:h-4" />}
            label="Deliverables"
            badge={
              deliverableCount.total > 0 ? (
                <span className="text-[10px] md:text-xs opacity-70">
                  ({deliverableCount.completed}/{deliverableCount.total})
                </span>
              ) : undefined
            }
          />
          <TabButton
            tab="activity"
            activeView={activeView}
            onClick={onTabChange}
            icon={<Clock className="w-3.5 h-3.5 md:w-4 md:h-4" />}
            label="Activity"
          />
          <TabButton
            tab="changes"
            activeView={activeView}
            onClick={onTabChange}
            icon={<GitPullRequest className="w-3.5 h-3.5 md:w-4 md:h-4" />}
            label="Changes"
          />
        </div>

        {showVersionSelector && (
          <div className="hidden md:block">
            <VersionSelector
              currentSnapshot={versionNav.currentSnapshot}
              totalSnapshots={versionNav.snapshots.length}
              currentIndex={versionNav.currentIndex}
              canGoPrevious={versionNav.canGoPrevious}
              canGoNext={versionNav.canGoNext}
              onPrevious={versionNav.goToPrevious}
              onNext={versionNav.goToNext}
              onCurrent={versionNav.goToCurrent}
            />
          </div>
        )}

        {showChangesControls && changesViewState && (
          <div className="hidden md:block">
            <ChangesHeaderControls state={changesViewState} repo={meta.repo ?? undefined} />
          </div>
        )}
      </div>

      {showChangesControls && changesViewState && (
        <div className="md:hidden py-2 border-t border-separator/50 mt-1">
          <ChangesHeaderControls state={changesViewState} repo={meta.repo ?? undefined} isMobile />
        </div>
      )}
    </div>
  );
}

interface TabButtonProps {
  tab: TaskViewTab;
  activeView: TaskViewTab;
  onClick: (tab: TaskViewTab) => void;
  icon: React.ReactNode;
  label: string;
  badge?: React.ReactNode;
}

function TabButton({ tab, activeView, onClick, icon, label, badge }: TabButtonProps) {
  const isActive = activeView === tab;
  return (
    <button
      type="button"
      onClick={() => onClick(tab)}
      className={`flex items-center justify-center gap-1.5 md:gap-2 pb-1.5 md:pb-2 px-1.5 md:px-2 font-medium text-xs md:text-sm transition-colors shrink-0 ${
        isActive
          ? 'text-primary border-b-2 border-primary'
          : 'text-muted-foreground hover:text-foreground border-b-2 border-transparent'
      }`}
    >
      {icon}
      {label}
      {badge}
    </button>
  );
}

interface PlanTabContentProps {
  taskId: TaskId;
  identity: UserIdentity | null;
  onRequestIdentity?: () => void;
  readOnly?: boolean;
}

function PlanTabContent({
  taskId,
  identity,
  onRequestIdentity,
  readOnly = false,
}: PlanTabContentProps) {
  return (
    <PlanViewerWithComments
      key={identity?.id ?? 'anonymous'}
      taskId={taskId}
      identity={identity}
      onRequestIdentity={onRequestIdentity}
      readOnly={readOnly}
    />
  );
}

export function TaskContent({
  taskId,
  identity,
  onRequestIdentity,
  initialTab = 'plan',
  onTabChange,
  readOnly = false,
}: TaskContentProps) {
  const isMobile = useIsMobile();
  const meta = useTaskMeta(taskId);
  const [activeView, setActiveView] = useState<TaskViewTab>(initialTab);
  const [changesViewState, setChangesViewState] = useState<ChangesViewState | null>(null);

  const deliverableCount = useDeliverableCount(taskId);
  const versionNav = useVersionNavigation(taskId);

  const handleTabChange = useCallback(
    (tab: TaskViewTab) => {
      setActiveView(tab);
      onTabChange?.(tab);
    },
    [onTabChange]
  );

  useEffect(() => {
    if (initialTab) {
      setActiveView(initialTab);
    }
  }, [initialTab]);

  useEffect(() => {
    const handleSwitchTab = (event: Event) => {
      if (!(event instanceof CustomEvent) || !event.detail || typeof event.detail !== 'object') {
        return;
      }
      const detailRecord = Object.fromEntries(Object.entries(event.detail));
      const tab = detailRecord.tab;
      if (typeof tab === 'string' && isValidTab(tab)) {
        handleTabChange(tab);
      }
    };

    document.addEventListener('switch-task-tab', handleSwitchTab);
    return () => document.removeEventListener('switch-task-tab', handleSwitchTab);
  }, [handleTabChange]);

  const validStatus = isTaskStatus(meta.status) ? meta.status : 'draft';
  const metaForChanges: TaskMeta = {
    id: meta.id,
    title: meta.title,
    status: validStatus,
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
    ownerId: meta.ownerId,
    sessionTokenHash: meta.sessionTokenHash,
    epoch: meta.epoch,
    tags: meta.tags,
    repo: meta.repo,
    archivedAt: meta.archivedAt,
    archivedBy: meta.archivedBy,
    completedAt: meta.completedAt,
    completedBy: meta.completedBy,
    approvalRequired: meta.approvalRequired,
    approvedUsers: meta.approvedUsers,
    rejectedUsers: meta.rejectedUsers,
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <TabNavigationBar
        activeView={activeView}
        onTabChange={handleTabChange}
        deliverableCount={deliverableCount}
        changesViewState={changesViewState}
        meta={metaForChanges}
        versionNav={versionNav}
      />

      {activeView === 'plan' && (
        <div className="flex-1 overflow-y-auto bg-background">
          <div className="grid grid-cols-[1fr_minmax(0,896px)_1fr] px-1 py-2 md:py-6">
            <div />
            <div className="md:px-6 space-y-3 md:space-y-6">
              <PlanTabContent
                taskId={taskId}
                identity={identity}
                onRequestIdentity={onRequestIdentity}
                readOnly={readOnly}
              />
              <Attachments taskId={taskId} />
            </div>
            <div />
          </div>
        </div>
      )}

      {activeView === 'activity' && (
        <div className="flex-1 overflow-y-auto bg-background">
          <div className="max-w-4xl mx-auto">
            <ActivityTimeline taskId={taskId} />
          </div>
        </div>
      )}

      {activeView === 'deliverables' && (
        <div className="flex-1 overflow-y-auto bg-background">
          <DeliverablesView
            taskId={taskId}
            identity={identity}
            onRequestIdentity={onRequestIdentity}
            isMobile={isMobile}
          />
        </div>
      )}

      {activeView === 'changes' && (
        <div className="flex-1 overflow-y-auto bg-background">
          <ChangesView
            taskId={taskId}
            meta={metaForChanges}
            isActive={activeView === 'changes'}
            onChangesViewState={setChangesViewState}
          />
        </div>
      )}
    </div>
  );
}
