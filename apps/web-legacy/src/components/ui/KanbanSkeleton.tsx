import { Skeleton } from "@heroui/react";

export function KanbanSkeleton() {
	return (
		<div className="flex gap-4 p-4 h-full min-w-min overflow-x-auto">
			{Array.from({ length: 6 }).map((_, colIndex) => (
				<div
					key={colIndex}
					className="w-72 shrink-0 bg-surface rounded-lg border border-separator flex flex-col"
				>
					<div className="px-3 py-2 border-b border-separator">
						<div className="flex items-center justify-between">
							<Skeleton className="h-4 w-24 rounded" />
							<Skeleton className="h-5 w-6 rounded-full" />
						</div>
					</div>

					<div className="p-2 space-y-2 flex-1">
						{Array.from({
							length: colIndex === 0 ? 3 : colIndex === 1 ? 2 : 1,
						}).map((_, cardIndex) => (
							<div
								key={cardIndex}
								className="bg-background rounded-lg border border-separator p-3 space-y-2"
							>
								<Skeleton className="h-4 w-full rounded" />
								<div className="flex items-center gap-2">
									<Skeleton className="h-3 w-16 rounded" />
									<Skeleton className="h-3 w-12 rounded" />
								</div>
							</div>
						))}
					</div>
				</div>
			))}
		</div>
	);
}
