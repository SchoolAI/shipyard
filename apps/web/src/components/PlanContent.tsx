/**
 * Reusable plan content component with tabbed navigation.
 * Extracted from PlanPage to support both full-page and panel views.
 */

import type { Block, BlockNoteEditor } from '@blocknote/core';
import type { Deliverable, LocalChangesResult, PlanMetadata, PlanSnapshot } from '@shipyard/schema';
import {
  extractDeliverables,
  getDeliverables,
  type PlanViewTab,
  YDOC_KEYS,
} from '@shipyard/schema';
import { Clock, FileText, GitPullRequest, Package } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { WebrtcProvider } from 'y-webrtc';
import type { WebsocketProvider } from 'y-websocket';
import type * as Y from 'yjs';
import { ActivityTimeline } from '@/components/ActivityTimeline';
import { Attachments } from '@/components/Attachments';
import { ChangesView } from '@/components/ChangesView';
import { DeliverablesView } from '@/components/DeliverablesView';
import { LocalChangesHeader } from '@/components/LocalChangesHeader';
import { PlanViewer } from '@/components/PlanViewer';
import { VersionSelector } from '@/components/VersionSelector';
import type { SyncState } from '@/hooks/useMultiProviderSync';

/**
 * Type guard to check if an array is a Block[] from BlockNote.
 * Validates that each item has the required 'type' and 'id' properties.
 */
function isBlockArray(arr: unknown): arr is Block[] {
  return (
    Array.isArray(arr) &&
    arr.every((item) => typeof item === 'object' && item !== null && 'type' in item && 'id' in item)
  );
}

/** Simple identity type for display purposes */
interface UserIdentity {
  id: string;
  name: string;
  color: string;
}

/** Provider type that BlockNote can use for collaboration */
type CollaborationProvider = WebsocketProvider | WebrtcProvider;

/** Version navigation state from useVersionNavigation hook */
interface VersionNavigationState {
  snapshots: PlanSnapshot[];
  currentIndex: number;
  currentSnapshot: PlanSnapshot | null;
  isViewingHistory: boolean;
  goToPrevious: () => void;
  goToNext: () => void;
  goToCurrent: () => void;
  canGoPrevious: boolean;
  canGoNext: boolean;
}

/** Props for live mode with collaboration */
interface LivePlanContentProps {
  mode: 'live';
  /** The Yjs document containing plan data */
  ydoc: Y.Doc;
  /** Plan metadata */
  metadata: PlanMetadata;
  /** Current sync state */
  syncState: SyncState;
  /** User identity for comments */
  identity: UserIdentity | null;
  /** Called when user needs to authenticate for commenting */
  onRequestIdentity: () => void;
  /** Provider for collaboration (WebSocket or WebRTC) */
  provider: CollaborationProvider | null;
  /** Initial tab to show (defaults to 'plan') */
  initialTab?: PlanViewTab;
  /** Snapshot to view (when viewing version history) - Issue #42 */
  currentSnapshot?: { content: unknown[] } | null;
  /** Callback to receive editor instance for snapshots - Issue #42 */
  onEditorReady?: (editor: BlockNoteEditor) => void;
  /** Version navigation state - Issue #42 */
  versionNav?: VersionNavigationState;
}

/** Props for snapshot mode (read-only) */
interface SnapshotPlanContentProps {
  mode: 'snapshot';
  /** The Yjs document containing plan data */
  ydoc: Y.Doc;
  /** Plan metadata */
  metadata: PlanMetadata;
  /** Current sync state */
  syncState: SyncState;
  /** Initial content for snapshots */
  initialContent: unknown[];
  /** Initial tab to show (defaults to 'plan') */
  initialTab?: PlanViewTab;
}

export type PlanContentProps = LivePlanContentProps | SnapshotPlanContentProps;

/**
 * Check if a value is a valid PlanViewTab.
 */
function isValidTab(value: string): value is PlanViewTab {
  return (
    value === 'plan' || value === 'activity' || value === 'deliverables' || value === 'changes'
  );
}

/**
 * Extract tab from a custom event detail, with validation.
 */
function extractTabFromEvent(event: Event): PlanViewTab | null {
  if (!(event instanceof CustomEvent) || !event.detail || typeof event.detail !== 'object') {
    return null;
  }
  const detailRecord = Object.fromEntries(Object.entries(event.detail));
  const tab = detailRecord.tab;
  if (typeof tab === 'string' && isValidTab(tab)) {
    return tab;
  }
  return null;
}

/**
 * Hook to track deliverable counts from Y.Doc.
 */
function useDeliverableCount(
  ydoc: Y.Doc,
  mode: 'live' | 'snapshot',
  initialContent?: unknown[]
): { completed: number; total: number } {
  const [count, setCount] = useState({ completed: 0, total: 0 });

  useEffect(() => {
    if (mode === 'snapshot' && initialContent && isBlockArray(initialContent)) {
      const deliverables = extractDeliverables(initialContent);
      const deliverablesArray = ydoc.getArray<Deliverable>(YDOC_KEYS.DELIVERABLES);
      deliverablesArray.delete(0, deliverablesArray.length);
      deliverablesArray.push(deliverables);

      const completed = deliverables.filter((d) => d.linkedArtifactId).length;
      setCount({ completed, total: deliverables.length });
      return;
    }

    const deliverablesArray = ydoc.getArray<Deliverable>(YDOC_KEYS.DELIVERABLES);
    const updateCount = () => {
      const deliverables = getDeliverables(ydoc);
      const completed = deliverables.filter((d) => d.linkedArtifactId).length;
      setCount({ completed, total: deliverables.length });
    };
    updateCount();
    deliverablesArray.observe(updateCount);
    return () => deliverablesArray.unobserve(updateCount);
  }, [ydoc, mode, initialContent]);

  return count;
}

/** Props for a single tab button */
interface TabButtonProps {
  tab: PlanViewTab;
  activeView: PlanViewTab;
  onClick: (tab: PlanViewTab) => void;
  icon: React.ReactNode;
  label: string;
  badge?: React.ReactNode;
}

/** Reusable tab button component */
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

/**
 * Tabbed plan content viewer.
 * Shows Plan, Deliverables, and Changes tabs with their respective content.
 */
export function PlanContent(props: PlanContentProps) {
  const { ydoc, metadata, syncState } = props;
  const [activeView, setActiveView] = useState<PlanViewTab>(props.initialTab || 'plan');
  const [localChangesState, setLocalChangesState] = useState<{
    data: LocalChangesResult | undefined;
    isFetching: boolean;
    refetch: () => void;
  } | null>(null);

  const initialContent = props.mode === 'snapshot' ? props.initialContent : undefined;
  const deliverableCount = useDeliverableCount(ydoc, props.mode, initialContent);

  /** Update activeView when initialTab changes */
  useEffect(() => {
    if (props.initialTab) {
      setActiveView(props.initialTab);
    }
  }, [props.initialTab]);

  /** Listen for external tab switch requests (e.g., from AgentRequestsBadge) */
  useEffect(() => {
    const handleSwitchTab = (event: Event) => {
      const tab = extractTabFromEvent(event);
      if (tab) {
        setActiveView(tab);
      }
    };

    document.addEventListener('switch-plan-tab', handleSwitchTab);
    return () => document.removeEventListener('switch-plan-tab', handleSwitchTab);
  }, []);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Tab navigation */}
      <div className="border-b border-separator bg-surface px-2 md:px-6 pt-1 md:pt-2 shrink-0">
        <div className="flex items-center justify-between">
          {/* Tabs on the left - scrollable on mobile */}
          <div className="flex gap-0 md:gap-4 overflow-x-auto md:overflow-visible">
            <TabButton
              tab="plan"
              activeView={activeView}
              onClick={setActiveView}
              icon={<FileText className="w-3.5 h-3.5 md:w-4 md:h-4" />}
              label="Plan"
            />
            <TabButton
              tab="activity"
              activeView={activeView}
              onClick={setActiveView}
              icon={<Clock className="w-3.5 h-3.5 md:w-4 md:h-4" />}
              label="Activity"
            />
            <TabButton
              tab="deliverables"
              activeView={activeView}
              onClick={setActiveView}
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
              tab="changes"
              activeView={activeView}
              onClick={setActiveView}
              icon={<GitPullRequest className="w-3.5 h-3.5 md:w-4 md:h-4" />}
              label="Changes"
            />
          </div>

          {/* Version selector on the right - only show on Plan tab when versions exist */}
          {activeView === 'plan' &&
            props.mode === 'live' &&
            props.versionNav &&
            props.versionNav.snapshots.length > 0 && (
              <VersionSelector
                currentSnapshot={props.versionNav.currentSnapshot}
                totalSnapshots={props.versionNav.snapshots.length}
                currentIndex={props.versionNav.currentIndex}
                canGoPrevious={props.versionNav.canGoPrevious}
                canGoNext={props.versionNav.canGoNext}
                onPrevious={props.versionNav.goToPrevious}
                onNext={props.versionNav.goToNext}
                onCurrent={props.versionNav.goToCurrent}
              />
            )}

          {/* Local changes header - only show on Changes tab when data available */}
          {activeView === 'changes' && localChangesState && (
            <LocalChangesHeader
              data={localChangesState.data}
              isFetching={localChangesState.isFetching}
              onRefresh={localChangesState.refetch}
            />
          )}
        </div>
      </div>

      {/* Tab content */}
      {activeView === 'plan' && (
        <div className="flex-1 overflow-y-auto bg-background">
          <div className="max-w-4xl mx-auto px-1 py-2 md:p-6 space-y-3 md:space-y-6">
            {props.mode === 'live' ? (
              <PlanViewer
                key={props.identity?.id ?? 'anonymous'}
                ydoc={ydoc}
                identity={props.identity}
                provider={props.provider}
                onRequestIdentity={props.onRequestIdentity}
                currentSnapshot={props.currentSnapshot}
                onEditorReady={props.onEditorReady}
              />
            ) : (
              <PlanViewer
                key="snapshot"
                ydoc={ydoc}
                identity={null}
                provider={null}
                initialContent={props.initialContent}
              />
            )}
            <Attachments ydoc={ydoc} registryPort={syncState.registryPort} />
          </div>
        </div>
      )}

      {activeView === 'activity' && (
        <div className="flex-1 overflow-y-auto bg-background">
          <div className="max-w-4xl mx-auto">
            <ActivityTimeline ydoc={ydoc} />
          </div>
        </div>
      )}

      {activeView === 'deliverables' && (
        <div className="flex-1 overflow-y-auto bg-background">
          <DeliverablesView
            ydoc={ydoc}
            metadata={metadata}
            identity={props.mode === 'live' ? props.identity : null}
            onRequestIdentity={props.mode === 'live' ? props.onRequestIdentity : undefined}
            registryPort={syncState.registryPort}
          />
        </div>
      )}

      {activeView === 'changes' && (
        <div className="flex-1 overflow-y-auto bg-background">
          <ChangesView
            ydoc={ydoc}
            metadata={metadata}
            isActive={activeView === 'changes'}
            onLocalChangesState={setLocalChangesState}
          />
        </div>
      )}
    </div>
  );
}
