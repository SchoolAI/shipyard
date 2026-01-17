/**
 * Reusable panel control buttons for expand/collapse, full screen, and close.
 * Used in PlanPanelHeader, InlinePlanDetail, and other panel contexts.
 */

import { Button } from '@heroui/react';
import { Maximize, Maximize2, Minimize, Minimize2, X } from 'lucide-react';
import type { PanelWidth } from './PlanPanel';

export interface PanelControlButtonsProps {
  /** Current panel width mode */
  width: PanelWidth;
  /** Called when expand/collapse button is pressed */
  onExpand?: () => void;
  /** Called when full screen button is pressed */
  onFullScreen: () => void;
  /** Called when close button is pressed */
  onClose: () => void;
  /** Whether the expand button should be hidden (e.g., when expand is not available) */
  hideExpand?: boolean;
}

/**
 * Three-button control group for panel actions:
 * - Expand/Collapse: Toggle between peek and expanded (modal) views
 * - Full Screen: Navigate to full plan page
 * - Close: Close the panel
 */
export function PanelControlButtons({
  width,
  onExpand,
  onFullScreen,
  onClose,
  hideExpand = false,
}: PanelControlButtonsProps) {
  const showExpandButton = !hideExpand && width !== 'full' && onExpand;

  return (
    <div className="flex items-center gap-0.5 shrink-0">
      {/* Expand/Collapse (peek <-> expanded) */}
      {showExpandButton && (
        <Button
          isIconOnly
          variant="ghost"
          size="sm"
          onPress={onExpand}
          aria-label={width === 'peek' ? 'Expand to modal' : 'Collapse to peek'}
        >
          {width === 'peek' ? <Maximize className="w-4 h-4" /> : <Minimize className="w-4 h-4" />}
        </Button>
      )}

      {/* Full screen toggle */}
      <Button
        isIconOnly
        variant="ghost"
        size="sm"
        onPress={onFullScreen}
        aria-label={width === 'full' ? 'Exit full screen' : 'Full screen'}
      >
        {width === 'full' ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
      </Button>

      {/* Close */}
      <Button isIconOnly variant="ghost" size="sm" onPress={onClose} aria-label="Close panel">
        <X className="w-4 h-4" />
      </Button>
    </div>
  );
}
