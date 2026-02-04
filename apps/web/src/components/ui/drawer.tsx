import { Modal } from '@heroui/react';
import type { ReactNode } from 'react';

interface DrawerProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  side?: 'left' | 'right';
  width?: string;
}

export function Drawer({
  isOpen,
  onOpenChange,
  children,
  side = 'left',
  width = 'w-64',
}: DrawerProps) {
  const isLeft = side === 'left';

  const enterAnimation = isLeft
    ? 'data-[entering]:animate-in data-[entering]:slide-in-from-left data-[entering]:duration-300 data-[entering]:ease-out'
    : 'data-[entering]:animate-in data-[entering]:slide-in-from-right data-[entering]:duration-300 data-[entering]:ease-out';

  const exitAnimation = isLeft
    ? 'data-[exiting]:animate-out data-[exiting]:slide-out-to-left data-[exiting]:duration-200 data-[exiting]:ease-in'
    : 'data-[exiting]:animate-out data-[exiting]:slide-out-to-right data-[exiting]:duration-200 data-[exiting]:ease-in';

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
