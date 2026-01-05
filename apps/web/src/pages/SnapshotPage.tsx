import { Chip, useOverlayState } from '@heroui/react';
import { getPlanFromUrl, type PlanMetadata } from '@peer-plan/schema';
import { useMemo } from 'react';
import * as Y from 'yjs';
import { MobileHeader } from '@/components/MobileHeader';
import { PlanHeader } from '@/components/PlanHeader';
import { PlanViewer } from '@/components/PlanViewer';
import { Sidebar } from '@/components/Sidebar';
import { Drawer } from '@/components/ui/drawer';
import { useIsMobile } from '@/hooks/useIsMobile';

export function SnapshotPage() {
  const urlPlan = getPlanFromUrl();
  const ydoc = useMemo(() => new Y.Doc(), []); // Empty doc, not synced
  const isMobile = useIsMobile();
  const drawerState = useOverlayState();

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
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-4 md:space-y-6">
      {/* Desktop: show PlanHeader with snapshot indicator */}
      {!isMobile && (
        <PlanHeader
          ydoc={ydoc}
          metadata={snapshotMetadata}
          identity={null}
          onRequestIdentity={noOp}
          isSnapshot
        />
      )}
      <PlanViewer ydoc={ydoc} identity={null} />
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
