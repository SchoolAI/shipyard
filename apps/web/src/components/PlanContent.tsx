/**
 * Reusable plan content component with tabbed navigation.
 * Extracted from PlanPage to support both full-page and panel views.
 */

import type { Block, BlockNoteEditor } from '@blocknote/core';
import type { PlanMetadata, PlanSnapshot } from '@peer-plan/schema';
import { extractDeliverables, getDeliverables, YDOC_KEYS } from '@peer-plan/schema';
import { Clock, FileText, GitPullRequest, Package } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { WebrtcProvider } from 'y-webrtc';
import type { WebsocketProvider } from 'y-websocket';
import type * as Y from 'yjs';
import { ActivityTimeline } from '@/components/ActivityTimeline';
import { Attachments } from '@/components/Attachments';
import { ChangesView } from '@/components/ChangesView';
import { DeliverablesView } from '@/components/DeliverablesView';
import { PlanViewer } from '@/components/PlanViewer';
import { VersionSelector } from '@/components/VersionSelector';
import type { SyncState } from '@/hooks/useMultiProviderSync';

type ViewType = 'plan' | 'activity' | 'deliverables' | 'changes';

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

export interface PlanContentProps {
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
  provider?: CollaborationProvider | null;
  /** Initial content for snapshots (when no provider) */
  initialContent?: unknown[];
  /** Whether this is a snapshot view (no sync) */
  isSnapshot?: boolean;
  /** Snapshot to view (when viewing version history) - Issue #42 */
  currentSnapshot?: { content: unknown[] } | null;
  /** Callback to receive editor instance for snapshots - Issue #42 */
  onEditorReady?: (editor: BlockNoteEditor) => void;
  /** Version navigation state - Issue #42 */
  versionNav?: VersionNavigationState;
}

/**
 * Tabbed plan content viewer.
 * Shows Plan, Deliverables, and Changes tabs with their respective content.
 */
export function PlanContent({
  ydoc,
  metadata,
  syncState,
  identity,
  onRequestIdentity,
  provider,
  initialContent,
  isSnapshot = false,
  currentSnapshot = null,
  onEditorReady,
  versionNav,
}: PlanContentProps) {
  const [activeView, setActiveView] = useState<ViewType>('plan');
  const [deliverableCount, setDeliverableCount] = useState({ completed: 0, total: 0 });

  useEffect(() => {
    if (isSnapshot && initialContent) {
      const deliverables = extractDeliverables(initialContent as Block[]);
      const deliverablesArray = ydoc.getArray(YDOC_KEYS.DELIVERABLES);
      deliverablesArray.delete(0, deliverablesArray.length);
      deliverablesArray.push(deliverables);

      const completed = deliverables.filter((d) => d.linkedArtifactId).length;
      setDeliverableCount({ completed, total: deliverables.length });
      return;
    }

    const deliverablesArray = ydoc.getArray(YDOC_KEYS.DELIVERABLES);
    const updateCount = () => {
      const deliverables = getDeliverables(ydoc);
      const completed = deliverables.filter((d) => d.linkedArtifactId).length;
      setDeliverableCount({ completed, total: deliverables.length });
    };
    updateCount();
    deliverablesArray.observe(updateCount);
    return () => deliverablesArray.unobserve(updateCount);
  }, [ydoc, isSnapshot, initialContent]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Tab navigation */}
      <div className="border-b border-separator bg-surface px-2 md:px-6 py-1 md:py-2 shrink-0">
        <div className="flex items-center justify-between">
          {/* Tabs on the left */}
          <div className="flex gap-0 md:gap-4">
            <button
              type="button"
              onClick={() => setActiveView('plan')}
              className={`flex items-center justify-center gap-2 pb-2 px-2 font-medium text-sm transition-colors flex-1 md:flex-initial ${
                activeView === 'plan'
                  ? 'text-primary border-b-2 border-primary'
                  : 'text-muted-foreground hover:text-foreground border-b-2 border-transparent'
              }`}
            >
              <FileText className="w-4 h-4" />
              Plan
            </button>
            <button
              type="button"
              onClick={() => setActiveView('activity')}
              className={`flex items-center justify-center gap-2 pb-2 px-2 font-medium text-sm transition-colors flex-1 md:flex-initial ${
                activeView === 'activity'
                  ? 'text-primary border-b-2 border-primary'
                  : 'text-muted-foreground hover:text-foreground border-b-2 border-transparent'
              }`}
            >
              <Clock className="w-4 h-4" />
              Activity
            </button>
            <button
              type="button"
              onClick={() => setActiveView('deliverables')}
              className={`flex items-center justify-center gap-2 pb-2 px-2 font-medium text-sm transition-colors flex-1 md:flex-initial ${
                activeView === 'deliverables'
                  ? 'text-primary border-b-2 border-primary'
                  : 'text-muted-foreground hover:text-foreground border-b-2 border-transparent'
              }`}
            >
              <Package className="w-4 h-4" />
              Deliverables
              {deliverableCount.total > 0 && (
                <span className="text-xs opacity-70">
                  ({deliverableCount.completed}/{deliverableCount.total})
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setActiveView('changes')}
              className={`flex items-center justify-center gap-2 pb-2 px-2 font-medium text-sm transition-colors flex-1 md:flex-initial ${
                activeView === 'changes'
                  ? 'text-primary border-b-2 border-primary'
                  : 'text-muted-foreground hover:text-foreground border-b-2 border-transparent'
              }`}
            >
              <GitPullRequest className="w-4 h-4" />
              Changes
            </button>
          </div>

          {/* Version selector on the right - only show on Plan tab when versions exist */}
          {activeView === 'plan' &&
            !isSnapshot &&
            versionNav &&
            versionNav.snapshots.length > 0 && (
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
            )}
        </div>
      </div>

      {/* Tab content */}
      {activeView === 'plan' && (
        <div className="flex-1 overflow-y-auto bg-background">
          <div className="max-w-4xl mx-auto px-1 py-2 md:p-6 space-y-3 md:space-y-6">
            <PlanViewer
              key={identity?.id ?? 'anonymous'}
              ydoc={ydoc}
              identity={isSnapshot ? null : identity}
              provider={provider}
              onRequestIdentity={isSnapshot ? undefined : onRequestIdentity}
              initialContent={isSnapshot ? initialContent : undefined}
              currentSnapshot={currentSnapshot}
              onEditorReady={onEditorReady}
            />
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
            identity={identity}
            onRequestIdentity={onRequestIdentity}
            registryPort={syncState.registryPort}
          />
        </div>
      )}

      {activeView === 'changes' && (
        <div className="flex-1 overflow-y-auto bg-background">
          <ChangesView ydoc={ydoc} metadata={metadata} />
        </div>
      )}
    </div>
  );
}
