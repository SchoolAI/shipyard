import { useOverlayState } from '@heroui/react';
import type { ReactNode } from 'react';
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

  // Mobile layout: default header + drawer (pages can override by rendering their own)
  if (isMobile) {
    return (
      <div className="flex flex-col h-screen-safe bg-background">
        <MobileHeader onMenuOpen={drawerState.open} />
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
