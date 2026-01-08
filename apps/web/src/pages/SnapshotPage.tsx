import { Chip, useOverlayState } from '@heroui/react';
import { addArtifact, getPlanFromUrl, type PlanMetadata } from '@peer-plan/schema';
import { FileText, Package } from 'lucide-react';
import { useMemo, useState } from 'react';
import * as Y from 'yjs';
import { Attachments } from '@/components/Attachments';
import { DeliverablesView } from '@/components/DeliverablesView';
import { MobileHeader } from '@/components/MobileHeader';
import { PlanHeader } from '@/components/PlanHeader';
import { PlanViewer } from '@/components/PlanViewer';
import { Sidebar } from '@/components/Sidebar';
import { Drawer } from '@/components/ui/drawer';
import { useIsMobile } from '@/hooks/useIsMobile';

type ViewType = 'plan' | 'deliverables';

export function SnapshotPage() {
  const urlPlan = getPlanFromUrl();
  const isMobile = useIsMobile();
  const drawerState = useOverlayState();
  const [activeView, setActiveView] = useState<ViewType>('plan');

  // Create ydoc and hydrate with artifacts
  const ydoc = useMemo(() => {
    if (!urlPlan) return new Y.Doc();

    const doc = new Y.Doc();

    // Add artifacts if present
    if (urlPlan.artifacts) {
      for (const artifact of urlPlan.artifacts) {
        addArtifact(doc, artifact);
      }
    }

    return doc;
  }, [urlPlan]);

  // Calculate deliverable count from URL data
  const deliverableCount = useMemo(() => {
    if (!urlPlan?.content) return { completed: 0, total: 0 };

    // Count checkbox items with {#deliverable} marker
    let total = 0;
    let completed = 0;

    const countDeliverables = (blocks: unknown[]) => {
      for (const block of blocks) {
        if (typeof block === 'object' && block !== null) {
          const b = block as { type?: string; content?: { text?: string }[]; children?: unknown[] };
          if (b.type === 'checkListItem' || b.type === 'bulletListItem') {
            const text = b.content?.map((c) => c.text || '').join('') || '';
            if (text.includes('{#deliverable}')) {
              total++;
              // Check if this deliverable is linked to an artifact
              const blockId = (block as { id?: string }).id;
              if (blockId && urlPlan.artifacts?.some((a) => a.linkedDeliverableId === blockId)) {
                completed++;
              }
            }
          }
          if (b.children) countDeliverables(b.children);
        }
      }
    };

    countDeliverables(urlPlan.content);
    return { completed, total };
  }, [urlPlan]);

  if (!urlPlan) {
    return (
      <div className="p-4 md:p-8 text-center">
        <h1 className="text-lg md:text-xl font-bold text-foreground">Invalid Snapshot</h1>
        <p className="text-sm md:text-base text-muted-foreground">
          The URL does not contain valid plan data.
        </p>
      </div>
    );
  }

  // Snapshot view is read-only, no identity needed
  const noOp = () => {};

  // Snapshots are static - no timestamps needed
  const snapshotMetadata: PlanMetadata = {
    id: urlPlan.id,
    title: urlPlan.title,
    status: urlPlan.status,
    repo: urlPlan.repo,
    pr: urlPlan.pr,
    createdAt: 0,
    updatedAt: 0,
  };

  const pageContent = (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header bar - hidden on mobile (shown in MobileHeader instead) */}
      {!isMobile && (
        <div className="border-b border-separator bg-surface px-2 md:px-6 py-1 md:py-3 shrink-0">
          <PlanHeader
            ydoc={ydoc}
            planId={urlPlan.id}
            metadata={snapshotMetadata}
            identity={null}
            onRequestIdentity={noOp}
            isSnapshot
          />
        </div>
      )}

      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Tab navigation */}
        <div className="border-b border-separator bg-surface px-2 md:px-6 py-1 md:py-2 shrink-0">
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
          </div>
        </div>

        {/* Tab content */}
        {activeView === 'plan' && (
          <div className="flex-1 overflow-y-auto bg-background">
            <div className="max-w-4xl mx-auto px-1 py-2 md:p-6 space-y-3 md:space-y-6">
              <PlanViewer ydoc={ydoc} identity={null} initialContent={urlPlan.content} />
              <Attachments ydoc={ydoc} />
            </div>
          </div>
        )}

        {activeView === 'deliverables' && (
          <div className="flex-1 overflow-y-auto bg-background">
            <DeliverablesView ydoc={ydoc} metadata={snapshotMetadata} identity={null} />
          </div>
        )}
      </div>
    </div>
  );

  // Mobile: Custom header with snapshot indicator
  if (isMobile) {
    return (
      <>
        <div className="fixed top-0 left-0 right-0 z-50">
          <MobileHeader
            onMenuOpen={drawerState.open}
            title={urlPlan.title}
            status={urlPlan.status}
            rightContent={
              <Chip color="warning" variant="soft" className="text-[11px] h-5 px-2">
                snapshot
              </Chip>
            }
          />
        </div>
        <Drawer isOpen={drawerState.isOpen} onOpenChange={drawerState.setOpen} side="left">
          <Sidebar inDrawer onNavigate={drawerState.close} />
        </Drawer>
        {pageContent}
      </>
    );
  }

  return pageContent;
}
