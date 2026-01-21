/**
 * Slide-out panel for viewing plans without losing board context.
 * Notion-style panel with three width modes: peek, expanded (center modal), full.
 * On mobile, displays as a bottom drawer for better touch UX.
 */

import { Modal } from '@heroui/react';
import type { ReactNode } from 'react';
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
 * Mobile bottom drawer implementation using HeroUI Modal.
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
  return (
    <Modal.Backdrop
      isOpen={isOpen}
      onOpenChange={(open) => !open && onClose()}
      isDismissable
      className="data-[entering]:animate-in data-[entering]:fade-in-0 data-[entering]:duration-200 data-[exiting]:animate-out data-[exiting]:fade-out-0 data-[exiting]:duration-150"
    >
      <Modal.Container className="flex items-end justify-center h-full w-full p-0">
        <Modal.Dialog
          className="w-full h-[85vh] max-h-[85vh] rounded-t-2xl shadow-xl bg-background flex flex-col p-0 data-[entering]:animate-in data-[entering]:slide-in-from-bottom data-[entering]:duration-300 data-[exiting]:animate-out data-[exiting]:slide-out-to-bottom data-[exiting]:duration-200"
          role="dialog"
          aria-modal="true"
          aria-label="Task details panel"
        >
          {/* Drag handle indicator */}
          <div className="flex justify-center pt-3 pb-2 shrink-0">
            <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
          </div>
          <div className="flex-1 overflow-hidden flex flex-col">{children}</div>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
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
              ? // Center modal (expanded mode)
                'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1100px] max-w-[90vw] h-[95vh] rounded-lg border border-separator animate-in zoom-in-95 fade-in duration-200'
              : // Side panel (peek/full modes)
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
