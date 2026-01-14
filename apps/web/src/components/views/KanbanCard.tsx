/**
 * Draggable Kanban card representing a plan.
 * Uses @dnd-kit for drag-drop functionality.
 */

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Card } from '@heroui/react';
import type { PlanIndexEntry } from '@peer-plan/schema';
import { GripVertical } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { formatRelativeTime } from '@/utils/formatters';

interface KanbanCardProps {
  plan: PlanIndexEntry;
}

export function KanbanCard({ plan }: KanbanCardProps) {
  const navigate = useNavigate();

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: plan.id,
    data: {
      type: 'plan',
      plan,
    },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const handleClick = () => {
    navigate(`/plan/${plan.id}`);
  };

  return (
    <div ref={setNodeRef} style={style}>
      <Card
        variant="secondary"
        className={`
          group cursor-pointer transition-shadow hover:shadow-md
          ${isDragging ? 'shadow-lg ring-2 ring-accent' : ''}
        `}
      >
        <Card.Header className="p-3">
          <div className="flex items-start gap-2">
            {/* Drag handle */}
            <button
              type="button"
              {...attributes}
              {...listeners}
              className="mt-0.5 p-0.5 rounded hover:bg-surface-hover cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity"
              aria-label="Drag to reorder"
            >
              <GripVertical className="w-4 h-4 text-muted-foreground" />
            </button>

            {/* Card content */}
            <button type="button" onClick={handleClick} className="flex-1 text-left">
              <Card.Title className="text-sm font-medium truncate">{plan.title}</Card.Title>
              <Card.Description className="text-xs mt-1">
                {formatRelativeTime(plan.updatedAt)}
              </Card.Description>
            </button>
          </div>
        </Card.Header>
      </Card>
    </div>
  );
}
