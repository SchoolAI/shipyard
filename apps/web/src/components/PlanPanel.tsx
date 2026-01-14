/**
 * Slide-out panel for viewing plans without losing board context.
 * Notion-style panel with three width modes: peek, expanded (center modal), full.
 */

import type { ReactNode } from 'react';

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
 * Slide-out panel container with smooth animations.
 * - peek: 512px side panel with subtle backdrop
 * - expanded: center modal with dimmed backdrop (like PlanPeekModal)
 * - full: full screen with solid background
 */
export function PlanPanel({ planId, width, onClose, children }: PlanPanelProps) {
  if (!planId) return null;

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
                'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] max-w-[90vw] h-[90vh] rounded-lg border border-separator animate-in zoom-in-95 fade-in duration-200'
              : // Side panel (peek/full modes)
                'top-0 right-0 h-full border-l border-separator animate-in slide-in-from-right duration-300 ease-out'
          }
          ${isPeek ? 'w-1/3 max-w-[90vw]' : ''}
          ${isFullScreen ? 'w-full' : ''}
        `}
        role="dialog"
        aria-modal={isCenterModal || isFullScreen}
        aria-label="Plan details panel"
      >
        {children}
      </aside>
    </>
  );
}
