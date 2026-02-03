/**
 * Kanban column that acts as a drop zone for plans.
 */

import { useDroppable } from "@dnd-kit/core";
import {
	SortableContext,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Chip } from "@heroui/react";
import type { ColumnWithPlans } from "@/hooks/useKanbanColumns";
import { KanbanCard } from "./KanbanCard";

interface KanbanColumnProps {
	column: ColumnWithPlans;
	/** Callback when a card is hovered (for Space bar peek preview) */
	onCardHover?: (planId: string | null) => void;
	/** Callback when a card is clicked (for slide-out panel) */
	onCardClick?: (planId: string) => void;
}

export function KanbanColumn({
	column,
	onCardHover,
	onCardClick,
}: KanbanColumnProps) {
	const { setNodeRef, isOver } = useDroppable({
		id: column.id,
		data: {
			type: "column",
			status: column.id,
		},
	});

	const planIds = column.plans.map((p) => p.id);

	return (
		<div
			ref={setNodeRef}
			className={`
        flex-shrink-0 w-72 bg-surface rounded-lg flex flex-col max-h-full
        transition-colors
        ${isOver ? "ring-2 ring-accent ring-opacity-50 bg-accent/5" : ""}
      `}
		>
			{/* Column Header */}
			<header className="flex items-center gap-2 p-3 border-b border-separator">
				<Chip size="sm" variant="soft" color={column.color}>
					{column.label}
				</Chip>
				<span className="text-xs text-muted-foreground">
					{column.plans.length}
				</span>
			</header>

			{/* Cards */}
			<div className="p-2 space-y-2 overflow-y-auto flex-1 min-h-[100px]">
				<SortableContext items={planIds} strategy={verticalListSortingStrategy}>
					{column.plans.length === 0 ? (
						<div className="flex items-center justify-center h-20 text-xs text-muted-foreground">
							No tasks
						</div>
					) : (
						column.plans.map((plan) => (
							<KanbanCard
								key={plan.id}
								plan={plan}
								onHover={onCardHover}
								onPanelOpen={onCardClick}
							/>
						))
					)}
				</SortableContext>
			</div>
		</div>
	);
}
