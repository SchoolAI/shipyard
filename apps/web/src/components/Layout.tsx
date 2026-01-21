import { useOverlayState } from '@heroui/react';
import { type ReactNode, useMemo } from 'react';
import { usePlanIndexContext } from '@/contexts/PlanIndexContext';
import { useInputRequests } from '@/hooks/useInputRequests';
import { useIsMobile } from '@/hooks/useIsMobile';
import { MobileHeader } from './MobileHeader';
import { Sidebar } from './Sidebar';
import { Drawer } from './ui/drawer';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const isMobile = useIsMobile();
  const drawerState = useOverlayState();
  const { inboxPlans, isLoading, ydoc: indexDoc } = usePlanIndexContext();
  const { pendingRequests } = useInputRequests({ ydoc: indexDoc });

  // Calculate total inbox count (plans + input requests) - same as Sidebar
  const totalInboxCount = useMemo(() => {
    return inboxPlans.length + pendingRequests.length;
  }, [inboxPlans, pendingRequests]);

  // Mobile layout: default header + drawer (pages can override by rendering their own)
  if (isMobile) {
    return (
      <div className="flex flex-col h-screen-safe bg-background">
        <MobileHeader
          onMenuOpen={drawerState.open}
          inboxCount={totalInboxCount}
          isLoadingInbox={isLoading}
        />
        <Drawer isOpen={drawerState.isOpen} onOpenChange={drawerState.setOpen} side="left">
          <Sidebar inDrawer onNavigate={drawerState.close} />
        </Drawer>
        <main className="flex-1 overflow-y-auto bg-background pt-12 pb-safe">{children}</main>
      </div>
    );
  }

  // Desktop layout: sidebar + main (unchanged)
  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-background">{children}</main>
    </div>
  );
}
