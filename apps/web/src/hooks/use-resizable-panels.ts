import { useCallback, useEffect, useRef, useState } from 'react';

/** Minimum pixel width for the right panel */
const MIN_RIGHT_PANEL_PX = 400;

/**
 * Hook for implementing draggable panel resize functionality.
 * Returns container ref, current split percentage, dragging state, drag start handler, and keyboard handler.
 *
 * Features:
 * - Mouse drag to resize panels
 * - Keyboard arrow keys for accessibility (WCAG 2.1.1)
 * - Enforces minimum pixel width for right panel (400px)
 */
export function useResizablePanels(defaultLeftPercent = 33) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [leftWidthPercent, setLeftWidthPercent] = useState(defaultLeftPercent);
  const [isDragging, setIsDragging] = useState(false);

  /** Calculate max left percent based on container width to ensure right panel minimum */
  const getMaxLeftPercent = useCallback(() => {
    if (!containerRef.current) return 80;
    const containerWidth = containerRef.current.getBoundingClientRect().width;
    return Math.min(80, ((containerWidth - MIN_RIGHT_PANEL_PX) / containerWidth) * 100);
  }, []);

  /** Handle drag start */
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  /** Handle keyboard navigation for accessibility (WCAG 2.1.1) */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setLeftWidthPercent((prev) => Math.max(prev - 5, 20));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        const maxPercent = getMaxLeftPercent();
        setLeftWidthPercent((prev) => Math.min(prev + 5, maxPercent));
      }
    },
    [getMaxLeftPercent]
  );

  /** Handle drag move - update width based on mouse position */
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const percent = ((e.clientX - rect.left) / rect.width) * 100;

      /** Ensure right panel is at least MIN_RIGHT_PANEL_PX pixels */
      const maxLeftPercent = Math.min(80, ((rect.width - MIN_RIGHT_PANEL_PX) / rect.width) * 100);

      setLeftWidthPercent(Math.min(Math.max(percent, 20), maxLeftPercent));
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  return {
    containerRef,
    leftWidthPercent,
    isDragging,
    handleDragStart,
    handleKeyDown,
  };
}
