import { Skeleton } from '@heroui/react';

export function InboxSkeleton() {
  return (
    <div className="h-full flex flex-col p-4 max-w-3xl mx-auto">
      <div className="flex flex-col gap-3 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-6 w-16 rounded mb-2" />
            <Skeleton className="h-4 w-40 rounded" />
          </div>
        </div>

        <Skeleton className="h-10 w-full rounded-lg" />
      </div>

      <div className="flex-1 space-y-1">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center justify-between gap-3 w-full py-3 px-3 rounded-lg border-b border-separator"
          >
            <div className="flex flex-col gap-2 flex-1 min-w-0">
              <Skeleton className="h-5 w-48 rounded" />
              <div className="flex items-center gap-2">
                <Skeleton className="h-5 w-24 rounded-full" />
                <Skeleton className="h-3 w-16 rounded" />
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <Skeleton className="h-8 w-8 rounded" />
              <Skeleton className="h-8 w-8 rounded" />
              <Skeleton className="h-8 w-8 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
