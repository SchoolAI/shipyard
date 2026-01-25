import { Modal } from '@heroui/react';
import type { ReactNode } from 'react';

interface DrawerProps {
  /** Whether the drawer is open */
  isOpen: boolean;
  /** Called when open state changes (backdrop click, close button, etc.) */
  onOpenChange: (open: boolean) => void;
  /** Content to render inside the drawer */
  children: ReactNode;
  /** Which side the drawer slides in from */
  side?: 'left' | 'right';
  /** Width of the drawer (default: w-64 = 256px) */
  width?: string;
}

/**
 * Mobile-friendly drawer component built on HeroUI Modal.
 * Slides in from the left (or right) as an overlay.
 */
export function Drawer({
  isOpen,
  onOpenChange,
  children,
  side = 'left',
  width = 'w-64',
}: DrawerProps) {
  const isLeft = side === 'left';

  // Animation classes for slide-in effect
  const enterAnimation = isLeft
    ? 'data-[entering]:animate-in data-[entering]:slide-in-from-left data-[entering]:duration-300 data-[entering]:ease-out'
    : 'data-[entering]:animate-in data-[entering]:slide-in-from-right data-[entering]:duration-300 data-[entering]:ease-out';

  const exitAnimation = isLeft
    ? 'data-[exiting]:animate-out data-[exiting]:slide-out-to-left data-[exiting]:duration-200 data-[exiting]:ease-in'
    : 'data-[exiting]:animate-out data-[exiting]:slide-out-to-right data-[exiting]:duration-200 data-[exiting]:ease-in';

  // Position the drawer container on the correct side
  const positionClass = isLeft ? 'justify-start' : 'justify-end';

  return (
    <Modal.Backdrop
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isDismissable
      className="data-[entering]:animate-in data-[entering]:fade-in-0 data-[entering]:duration-300 data-[exiting]:animate-out data-[exiting]:fade-out-0 data-[exiting]:duration-200"
    >
      <Modal.Container
        className={`flex items-stretch ${positionClass} h-full max-h-full w-full p-0`}
      >
        <Modal.Dialog
          className={`${width} h-full max-h-full rounded-none shadow-xl bg-surface flex flex-col p-0 ${enterAnimation} ${exitAnimation}`}
          role="dialog"
          aria-modal="true"
          aria-label="Navigation drawer"
        >
          {children}
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
