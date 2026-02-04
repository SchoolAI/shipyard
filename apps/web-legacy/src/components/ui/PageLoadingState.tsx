import { Spinner } from '@heroui/react';

interface PageLoadingStateProps {
  message?: string;
}

export function PageLoadingState({ message = 'Loading...' }: PageLoadingStateProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4 p-4">
      <Spinner size="lg" />
      <p className="text-muted-foreground text-sm">{message}</p>
    </div>
  );
}
