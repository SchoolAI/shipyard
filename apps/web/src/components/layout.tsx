import { useOverlayState } from '@heroui/react';
import { type ReactNode, useMemo } from 'react';
import { MobileHeader } from '@/components/mobile-header';
import { OfflineBanner } from '@/components/offline-banner';
import { Sidebar } from '@/components/sidebar';
import { Drawer } from '@/components/ui/drawer';
import { useIsMobile } from '@/hooks/use-is-mobile';
import { useTaskIndex } from '@/loro/selectors/room-selectors';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const isMobile = useIsMobile();
  const drawerState = useOverlayState();
  const taskIndex = useTaskIndex();

  const totalInboxCount = useMemo(() => {
    return Object.values(taskIndex).filter(
      (t) => t.status === 'pending_review' || t.hasPendingRequests
    ).length;
  }, [taskIndex]);

  if (isMobile) {
    return (
      <div className="flex flex-col h-screen-safe bg-background">
        <MobileHeader onMenuOpen={drawerState.open} inboxCount={totalInboxCount} />
        <Drawer isOpen={drawerState.isOpen} onOpenChange={drawerState.setOpen} side="left">
          <Sidebar inDrawer onNavigate={drawerState.close} />
        </Drawer>
        <OfflineBanner />
        <main className="flex-1 overflow-y-auto bg-background pt-12 pb-safe">{children}</main>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0">
        <OfflineBanner />
        <main className="flex-1 overflow-y-auto bg-background">{children}</main>
      </div>
    </div>
  );
}
