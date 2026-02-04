import type { ReactNode } from 'react';
import { useState } from 'react';
import { Drawer } from 'vaul';

export type PanelWidth = 'peek' | 'expanded' | 'full';

export interface TaskPanelProps {
  taskId: string | null;
  width: PanelWidth;
  onClose: () => void;
  onChangeWidth: (width: PanelWidth) => void;
  children: ReactNode;
}

function MobileBottomDrawer({
  isOpen,
  onClose,
  children,
}: {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const DEFAULT_SNAP = 0.65;
  const EXPANDED_SNAP = 0.95;
  const snapPoints: (string | number)[] = [DEFAULT_SNAP, EXPANDED_SNAP];

  const [activeSnapPoint, setActiveSnapPoint] = useState<number | string | null>(DEFAULT_SNAP);

  return (
    <Drawer.Root
      open={isOpen}
      onOpenChange={(open: boolean) => !open && onClose()}
      snapPoints={snapPoints}
      activeSnapPoint={activeSnapPoint}
      setActiveSnapPoint={setActiveSnapPoint}
      snapToSequentialPoint
      fadeFromIndex={0}
      handleOnly
    >
      <Drawer.Overlay className="fixed inset-0 z-40 bg-black/40" />
      <Drawer.Content
        className="fixed bottom-0 left-0 right-0 z-50 flex flex-col rounded-t-2xl bg-background outline-none"
        style={{ height: `${EXPANDED_SNAP * 100}vh` }}
        aria-label="Task details panel"
      >
        <Drawer.Handle className="mx-auto mt-3 mb-2 h-1.5 w-12 shrink-0 rounded-full bg-muted-foreground/30" />
        <div className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col pb-safe overscroll-contain">
          {children}
        </div>
      </Drawer.Content>
    </Drawer.Root>
  );
}

function DesktopPanel({
  width,
  onClose,
  children,
}: {
  width: PanelWidth;
  onClose: () => void;
  children: ReactNode;
}) {
  const isFullScreen = width === 'full';
  const isCenterModal = width === 'expanded';
  const isPeek = width === 'peek';

  return (
    <>
      {(isCenterModal || isFullScreen) && (
        <button
          type="button"
          className={`
						fixed inset-0 z-40 transition-opacity duration-300
						${isFullScreen ? 'bg-background' : 'bg-black/30 backdrop-blur-sm'}
					`}
          onClick={onClose}
          aria-label="Close panel"
        />
      )}

      {isPeek && (
        <div
          className="fixed inset-0 z-40 bg-black/10 backdrop-blur-[2px] pointer-events-none"
          aria-hidden="true"
        />
      )}

      <aside
        className={`
					fixed z-50
					bg-background shadow-xl
					flex flex-col overflow-hidden
					${
            isCenterModal
              ? 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1100px] max-w-[90vw] h-[95vh] rounded-lg border border-separator animate-in zoom-in-95 fade-in duration-200'
              : 'top-0 right-0 h-full border-l border-separator animate-in slide-in-from-right duration-300 ease-out'
          }
					${isPeek ? 'w-1/2 max-w-[90vw]' : ''}
					${isFullScreen ? 'w-full' : ''}
				`}
        role="dialog"
        aria-modal={isCenterModal || isFullScreen}
        aria-label="Task details panel"
      >
        {children}
      </aside>
    </>
  );
}

export function TaskPanel({
  taskId,
  width,
  onClose,
  children,
  isMobile,
}: TaskPanelProps & { isMobile: boolean }) {
  if (!taskId) return null;

  if (isMobile) {
    return (
      <MobileBottomDrawer isOpen={!!taskId} onClose={onClose}>
        {children}
      </MobileBottomDrawer>
    );
  }

  return (
    <DesktopPanel width={width} onClose={onClose}>
      {children}
    </DesktopPanel>
  );
}
