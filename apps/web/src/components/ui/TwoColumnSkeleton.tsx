import { Skeleton } from "@heroui/react";

interface TwoColumnSkeletonProps {
	/** Number of list items to show (default: 3) */
	itemCount?: number;
	/** Whether to show action buttons on each item (default: true) */
	showActions?: boolean;
	/** Header title placeholder width (default: 'w-20') */
	titleWidth?: string;
	/** Header subtitle placeholder width (default: 'w-32') */
	subtitleWidth?: string;
}

/**
 * Shared skeleton loader for two-column layouts (list + detail panel).
 * Used by InboxPage and ArchivePage to maintain consistent loading states.
 */
export function TwoColumnSkeleton({
	itemCount = 3,
	showActions = true,
	titleWidth = "w-20",
	subtitleWidth = "w-32",
}: TwoColumnSkeletonProps) {
	return (
		<div className="h-full grid grid-cols-[minmax(300px,400px)_1fr]">
			{/* Left: List skeleton */}
			<div className="flex flex-col h-full overflow-hidden border-r border-separator">
				{/* Header */}
				<div className="border-b border-separator shrink-0 p-4">
					<div className="flex flex-col gap-3 mb-4">
						<Skeleton className={`h-6 ${titleWidth} rounded`} />
						<Skeleton className={`h-4 ${subtitleWidth} rounded`} />
					</div>
				</div>

				{/* List items */}
				<div className="flex-1 overflow-y-auto p-2 space-y-2">
					{Array.from({ length: itemCount }).map((_, i) => (
						<div
							key={i}
							className="flex items-center justify-between gap-3 py-3 px-3 rounded-lg"
						>
							<div className="flex flex-col gap-2 flex-1">
								<Skeleton className="h-5 w-48 rounded" />
								<Skeleton className="h-3 w-24 rounded" />
							</div>
							{showActions && (
								<div className="flex gap-1">
									<Skeleton className="h-8 w-8 rounded" />
									<Skeleton className="h-8 w-8 rounded" />
									<Skeleton className="h-8 w-8 rounded" />
								</div>
							)}
						</div>
					))}
				</div>
			</div>

			{/* Right: Empty detail panel */}
			<div className="flex flex-col h-full overflow-hidden" />
		</div>
	);
}
