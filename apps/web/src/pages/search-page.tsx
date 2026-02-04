import { Button, Checkbox, CheckboxGroup, ListBox, Popover, Spinner } from '@heroui/react';
import { isTaskStatus, type TaskId, type TaskStatus, toTaskId } from '@shipyard/loro-schema';
import { Filter, LayoutGrid, Search, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { StatusChip } from '@/components/status-chip';
import { TagChip } from '@/components/tag-chip';
import { SearchPlanInput } from '@/components/ui/search-plan-input';
import { getTaskRoute } from '@/constants/routes';
import { useGitHubAuth } from '@/hooks/use-github-auth';
import { useTaskIndex } from '@/loro/selectors/room-selectors';
import { formatRelativeTime } from '@/utils/formatters';

type OwnershipFilter = 'all' | 'my-tasks' | 'shared';

const STATUS_FILTER_OPTIONS: Array<{ value: TaskStatus; label: string }> = [
  { value: 'draft', label: 'Draft' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'pending_review', label: 'Pending Review' },
  { value: 'changes_requested', label: 'Changes Requested' },
  { value: 'completed', label: 'Completed' },
];

interface SearchResultItemProps {
  taskId: TaskId;
  title: string;
  status: TaskStatus;
  lastUpdated: number;
  tags: string[];
}

function SearchResultItem({ title, status, lastUpdated, tags }: SearchResultItemProps) {
  return (
    <div className="flex items-center justify-between gap-3 w-full py-2">
      <div className="flex flex-col gap-1 flex-1 min-w-0">
        <span className="font-medium text-foreground truncate">{title}</span>
        <div className="flex items-center gap-2 flex-wrap">
          <StatusChip status={status} />
          <span className="text-xs text-muted-foreground">{formatRelativeTime(lastUpdated)}</span>
          {tags.length > 0 && (
            <div className="flex gap-1 items-center">
              {tags.slice(0, 3).map((tag) => (
                <TagChip key={tag} tag={tag} size="sm" />
              ))}
              {tags.length > 3 && (
                <span className="text-xs text-muted-foreground">+{tags.length - 3}</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface FilterBarProps {
  ownershipFilter: OwnershipFilter;
  onOwnershipFilterChange: (filter: OwnershipFilter) => void;
  statusFilters: TaskStatus[];
  onStatusFiltersChange: (statuses: TaskStatus[]) => void;
  tagFilters: string[];
  onTagFiltersChange: (tags: string[]) => void;
  allTags: string[];
}

function FilterBar({
  ownershipFilter,
  onOwnershipFilterChange,
  statusFilters,
  onStatusFiltersChange,
  tagFilters,
  onTagFiltersChange,
  allTags,
}: FilterBarProps) {
  const [isStatusOpen, setIsStatusOpen] = useState(false);
  const [isTagOpen, setIsTagOpen] = useState(false);

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1 flex-1">
        <button
          type="button"
          onClick={() => onOwnershipFilterChange('all')}
          className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
            ownershipFilter === 'all'
              ? 'bg-accent/10 text-accent font-medium'
              : 'text-muted-foreground hover:text-foreground hover:bg-surface-hover'
          }`}
        >
          All
        </button>
        <button
          type="button"
          onClick={() => onOwnershipFilterChange('my-tasks')}
          className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
            ownershipFilter === 'my-tasks'
              ? 'bg-accent/10 text-accent font-medium'
              : 'text-muted-foreground hover:text-foreground hover:bg-surface-hover'
          }`}
        >
          My Tasks
        </button>
        <button
          type="button"
          onClick={() => onOwnershipFilterChange('shared')}
          className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
            ownershipFilter === 'shared'
              ? 'bg-accent/10 text-accent font-medium'
              : 'text-muted-foreground hover:text-foreground hover:bg-surface-hover'
          }`}
        >
          Shared
        </button>
      </div>

      <Popover isOpen={isStatusOpen} onOpenChange={setIsStatusOpen}>
        <Popover.Trigger>
          <Button variant="ghost" size="sm" className="gap-2">
            <Filter className="w-4 h-4" />
            Status
            {statusFilters.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 text-xs bg-accent/20 text-accent rounded">
                {statusFilters.length}
              </span>
            )}
          </Button>
        </Popover.Trigger>
        <Popover.Content placement="bottom end" className="w-64">
          <Popover.Dialog>
            <Popover.Arrow />
            <Popover.Heading>Filter by Status</Popover.Heading>
            <div className="mt-3">
              <CheckboxGroup
                value={statusFilters}
                onChange={(values) =>
                  onStatusFiltersChange(values.filter((v): v is TaskStatus => isTaskStatus(v)))
                }
              >
                {STATUS_FILTER_OPTIONS.map((option) => (
                  <Checkbox key={option.value} value={option.value}>
                    {option.label}
                  </Checkbox>
                ))}
              </CheckboxGroup>
            </div>
          </Popover.Dialog>
        </Popover.Content>
      </Popover>

      {allTags.length > 0 && (
        <Popover isOpen={isTagOpen} onOpenChange={setIsTagOpen}>
          <Popover.Trigger>
            <Button variant="ghost" size="sm" className="gap-2">
              <Filter className="w-4 h-4" />
              Tags
              {tagFilters.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 text-xs bg-accent/20 text-accent rounded">
                  {tagFilters.length}
                </span>
              )}
            </Button>
          </Popover.Trigger>
          <Popover.Content placement="bottom end" className="w-64">
            <Popover.Dialog>
              <Popover.Arrow />
              <Popover.Heading>Filter by Tags</Popover.Heading>
              <div className="mt-3 space-y-2 max-h-64 overflow-y-auto">
                <CheckboxGroup
                  value={tagFilters}
                  onChange={(values) => onTagFiltersChange(values as string[])}
                >
                  {allTags.map((tag) => (
                    <Checkbox key={tag} value={tag}>
                      <TagChip tag={tag} />
                    </Checkbox>
                  ))}
                </CheckboxGroup>
              </div>
            </Popover.Dialog>
          </Popover.Content>
        </Popover>
      )}

      <Button variant="ghost" size="sm" className="gap-2" isDisabled>
        <LayoutGrid className="w-4 h-4" />
        Display
      </Button>
    </div>
  );
}

interface TaskDetailPanelProps {
  taskId: TaskId | null;
  onClose: () => void;
}

function TaskDetailPanel({ taskId, onClose }: TaskDetailPanelProps) {
  const navigate = useNavigate();

  if (!taskId) {
    return (
      <div className="flex flex-col h-full items-center justify-center">
        <p className="text-muted-foreground">Select a task to view details</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-4 border-b border-separator">
        <h2 className="font-medium text-foreground">Task Preview</h2>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onPress={() => navigate(getTaskRoute(taskId))}>
            Open Full View
          </Button>
          <Button isIconOnly variant="ghost" size="sm" onPress={onClose} aria-label="Close panel">
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center p-4">
        <p className="text-muted-foreground text-center">
          Task detail preview will be available soon.
          <br />
          Click "Open Full View" to see the complete task.
        </p>
      </div>
    </div>
  );
}

export function SearchPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { identity } = useGitHubAuth();
  const username = identity?.username ?? null;

  const taskIndex = useTaskIndex();

  const [searchQuery, setSearchQuery] = useState('');
  const [ownershipFilter, setOwnershipFilter] = useState<OwnershipFilter>('all');
  const [statusFilters, setStatusFilters] = useState<TaskStatus[]>([]);
  const [tagFilters, setTagFilters] = useState<string[]>([]);

  const searchParams = new URLSearchParams(location.search);
  const initialPanelId = searchParams.get('panel');
  const [selectedTaskId, setSelectedTaskId] = useState<TaskId | null>(
    initialPanelId ? toTaskId(initialPanelId) : null
  );

  const allTasks = useMemo(() => {
    return Object.values(taskIndex);
  }, [taskIndex]);

  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    return Array.from(tagSet).sort();
  }, []);

  const ownershipFilteredTasks = useMemo(() => {
    if (!username) return allTasks;

    switch (ownershipFilter) {
      case 'my-tasks':
        return allTasks.filter((task) => task.ownerId === username);
      case 'shared':
        return allTasks.filter((task) => task.ownerId !== username);
      default:
        return allTasks;
    }
  }, [ownershipFilter, username, allTasks]);

  const filteredTasks = useMemo(() => {
    let tasks = ownershipFilteredTasks;

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      tasks = tasks.filter((task) => task.title.toLowerCase().includes(query));
    }

    if (statusFilters.length > 0) {
      tasks = tasks.filter(
        (task) => isTaskStatus(task.status) && statusFilters.includes(task.status)
      );
    }

    return tasks;
  }, [ownershipFilteredTasks, searchQuery, statusFilters]);

  const sortedTasks = useMemo(() => {
    return [...filteredTasks].sort((a, b) => b.lastUpdated - a.lastUpdated);
  }, [filteredTasks]);

  useEffect(() => {
    if (selectedTaskId && !sortedTasks.find((t) => t.taskId === selectedTaskId)) {
      setSelectedTaskId(null);
    }
  }, [selectedTaskId, sortedTasks]);

  useEffect(() => {
    if (selectedTaskId) {
      navigate(`?panel=${selectedTaskId}`, { replace: true });
    } else {
      navigate('', { replace: true });
    }
  }, [selectedTaskId, navigate]);

  const handleClosePanel = useCallback(() => {
    setSelectedTaskId(null);
  }, []);

  const handleListSelection = (keys: Set<unknown> | 'all') => {
    if (keys === 'all') return;
    const key = Array.from(keys)[0];
    if (key) {
      setSelectedTaskId(toTaskId(String(key)));
    }
  };

  const isLoading = false;

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  const hasActiveFilters =
    searchQuery.trim() !== '' || statusFilters.length > 0 || tagFilters.length > 0;

  return (
    <div
      className={`h-full ${selectedTaskId ? 'grid grid-cols-[minmax(300px,400px)_1fr]' : 'flex flex-col'}`}
    >
      <div
        className={`flex flex-col h-full overflow-hidden ${selectedTaskId ? 'border-r border-separator' : 'max-w-3xl mx-auto w-full p-4'}`}
      >
        <div className={`border-b border-separator shrink-0 ${selectedTaskId ? 'p-4' : 'mb-4'}`}>
          <h1 className="text-xl font-bold text-foreground mb-3">Search</h1>
          <SearchPlanInput
            aria-label="Search tasks"
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search tasks..."
            className="w-full mb-3"
          />
          <FilterBar
            ownershipFilter={ownershipFilter}
            onOwnershipFilterChange={setOwnershipFilter}
            statusFilters={statusFilters}
            onStatusFiltersChange={setStatusFilters}
            tagFilters={tagFilters}
            onTagFiltersChange={setTagFilters}
            allTags={allTags}
          />
        </div>

        <div className={`flex-1 overflow-y-auto ${selectedTaskId ? 'p-2' : ''}`}>
          {!hasActiveFilters && (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <Search className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                <p className="text-muted-foreground">Type to search tasks or use filters</p>
              </div>
            </div>
          )}

          {hasActiveFilters && sortedTasks.length === 0 && (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <p className="text-muted-foreground">
                  No tasks match your search
                  {searchQuery && ` for "${searchQuery}"`}
                </p>
              </div>
            </div>
          )}

          {hasActiveFilters && sortedTasks.length > 0 && (
            <>
              <p className="text-sm text-muted-foreground px-2 mb-2">
                {sortedTasks.length} {sortedTasks.length === 1 ? 'result' : 'results'}
              </p>
              <ListBox
                aria-label="Search results"
                selectionMode="single"
                selectedKeys={selectedTaskId ? new Set([selectedTaskId]) : new Set()}
                onSelectionChange={handleListSelection}
                className="divide-y divide-separator"
              >
                {sortedTasks.map((task) => (
                  <ListBox.Item
                    id={task.taskId}
                    key={task.taskId}
                    textValue={task.title}
                    className="px-3 rounded-lg hover:bg-surface"
                  >
                    <SearchResultItem
                      taskId={toTaskId(task.taskId)}
                      title={task.title}
                      status={isTaskStatus(task.status) ? task.status : 'draft'}
                      lastUpdated={task.lastUpdated}
                      tags={[]}
                    />
                  </ListBox.Item>
                ))}
              </ListBox>
            </>
          )}
        </div>
      </div>

      {selectedTaskId && (
        <div className="flex flex-col h-full overflow-hidden">
          <TaskDetailPanel taskId={selectedTaskId} onClose={handleClosePanel} />
        </div>
      )}
    </div>
  );
}
