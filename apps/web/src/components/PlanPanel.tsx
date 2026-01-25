/**
 * Slide-out panel for viewing plans without losing board context.
 * Notion-style panel with three width modes: peek, expanded (center modal), full.
 * On mobile, displays as a draggable bottom drawer using vaul.
 */

import { type ReactNode, useState } from 'react';
import { Drawer } from 'vaul';
import { useIsMobile } from '@/hooks/useIsMobile';

export type PanelWidth = 'peek' | 'expanded' | 'full';

export interface PlanPanelProps {
  /** Plan ID being viewed, null means closed */
  planId: string | null;
  /** Current width mode */
  width: PanelWidth;
  /** Close the panel */
  onClose: () => void;
  /** Change panel width */
  onChangeWidth: (width: PanelWidth) => void;
  /** Panel content */
  children: ReactNode;
}

/**
 * Mobile bottom drawer implementation using vaul.
 * Supports drag gestures, snap points, and spring animations.
 */
function MobileBottomDrawer({
  isOpen,
  onClose,
  children,
}: {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  // Snap points configuration
  const DEFAULT_SNAP = 0.65;
  const EXPANDED_SNAP = 0.95;
  const snapPoints: (string | number)[] = [DEFAULT_SNAP, EXPANDED_SNAP];

  // Controlled state for snap point - required to make it "stick" after dragging
  const [activeSnapPoint, setActiveSnapPoint] = useState<number | string | null>(DEFAULT_SNAP);

  return (
    <Drawer.Root
      open={isOpen}
      onOpenChange={(open) => !open && onClose()}
      snapPoints={snapPoints}
      activeSnapPoint={activeSnapPoint}
      setActiveSnapPoint={setActiveSnapPoint}
      // Prevent velocity-based snap point skipping - ensures drawer stays at dragged position
      snapToSequentialPoint
      // Start fading overlay when dragging below the first snap point
      fadeFromIndex={0}
      // Only drag from handle, allow content scrolling
      handleOnly
    >
      <Drawer.Overlay className="fixed inset-0 z-40 bg-black/40" />
      <Drawer.Content
        className="fixed bottom-0 left-0 right-0 z-50 flex flex-col rounded-t-2xl bg-background outline-none"
        style={{ height: `${EXPANDED_SNAP * 100}vh` }}
        aria-label="Task details panel"
      >
        {/* Drag handle - only this area triggers drag gestures */}
        <Drawer.Handle className="mx-auto mt-3 mb-2 h-1.5 w-12 shrink-0 rounded-full bg-muted-foreground/30" />
        {/* Scrollable content area */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col pb-safe overscroll-contain">
          {children}
        </div>
      </Drawer.Content>
    </Drawer.Root>
  );
}

/**
 * Desktop slide-out panel container with smooth animations.
 * - peek: 50% width side panel with subtle backdrop
 * - expanded: center modal with dimmed backdrop (like PlanPeekModal)
 * - full: full screen with solid background
 */
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
      {/* Backdrop */}
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

      {/* Peek mode: subtle backdrop */}
      {isPeek && (
        <div
          className="fixed inset-0 z-40 bg-black/10 backdrop-blur-[2px] pointer-events-none"
          aria-hidden="true"
        />
      )}

      {/* Panel container - side panel for peek/full, center modal for expanded */}
      <aside
        className={`
          fixed z-50
          bg-background shadow-xl
          flex flex-col overflow-hidden
          ${
            isCenterModal
              ?
                'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1100px] max-w-[90vw] h-[95vh] rounded-lg border border-separator animate-in zoom-in-95 fade-in duration-200'
              :
                'top-0 right-0 h-full border-l border-separator animate-in slide-in-from-right duration-300 ease-out'
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

/**
 * Slide-out panel container with smooth animations.
 * On mobile, renders as a bottom drawer for better touch UX.
 * On desktop:
 * - peek: 50% width side panel with subtle backdrop
 * - expanded: center modal with dimmed backdrop
 * - full: full screen with solid background
 */
export function PlanPanel({ planId, width, onClose, children }: PlanPanelProps) {
  const isMobile = useIsMobile();

  if (!planId) return null;

  // Mobile: always use bottom drawer
  if (isMobile) {
    return (
      <MobileBottomDrawer isOpen={!!planId} onClose={onClose}>
        {children}
      </MobileBottomDrawer>
    );
  }

  // Desktop: use existing side panel / center modal behavior
  return (
    <DesktopPanel width={width} onClose={onClose}>
      {children}
    </DesktopPanel>
  );
}
