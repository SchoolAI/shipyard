import { Skeleton } from "@heroui/react";

interface PlanListSkeletonProps {
	count?: number;
}

export function PlanListSkeleton({ count = 3 }: PlanListSkeletonProps) {
	return (
		<div className="space-y-1 p-2">
			{Array.from({ length: count }).map((_, i) => (
				<div key={i} className="flex items-center gap-3 px-3 py-2 rounded-lg">
					<Skeleton className="h-4 flex-1 rounded" />
					<Skeleton className="h-4 w-8 rounded" />
				</div>
			))}
		</div>
	);
}
