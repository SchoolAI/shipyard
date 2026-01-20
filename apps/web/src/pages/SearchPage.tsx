/**
 * Search Page - Global search across all plans.
 * Two-column layout with search input + results list on left and detail panel on right.
 */

import { Button, Checkbox, ListBox, ListBoxItem, Popover, Spinner } from '@heroui/react';
import { getAllTagsFromIndex, PLAN_INDEX_DOC_NAME, type PlanIndexEntry } from '@shipyard/schema';
import { Filter, LayoutGrid, Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { InlinePlanDetail } from '@/components/InlinePlanDetail';
import { OfflineBanner } from '@/components/OfflineBanner';
import { StatusChip } from '@/components/StatusChip';
import { TagChip } from '@/components/TagChip';
import { SearchPlanInput } from '@/components/ui/SearchPlanInput';
import { useGitHubAuth } from '@/hooks/useGitHubAuth';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useMultiProviderSync } from '@/hooks/useMultiProviderSync';
import { usePlanIndex } from '@/hooks/usePlanIndex';
import { STATUS_FILTER_OPTIONS, useViewFilters } from '@/hooks/useViewFilters';
import { formatRelativeTime } from '@/utils/formatters';
import { setSidebarCollapsed } from '@/utils/uiPreferences';

interface SearchResultItemProps {
  plan: PlanIndexEntry;
}

function SearchResultItem({ plan }: SearchResultItemProps) {
  return (
    <div className="flex items-center justify-between gap-3 w-full py-2">
      <div className="flex flex-col gap-1 flex-1 min-w-0">
        <span className="font-medium text-foreground truncate">{plan.title}</span>
        <div className="flex items-center gap-2 flex-wrap">
          <StatusChip status={plan.status} />
          <span className="text-xs text-muted-foreground">
            {formatRelativeTime(plan.updatedAt)}
          </span>
          {/* Show first 3 tags */}
          {plan.tags && plan.tags.length > 0 && (
            <div className="flex gap-1 items-center">
              {plan.tags.slice(0, 3).map((tag) => (
                <TagChip key={tag} tag={tag} size="sm" />
              ))}
              {plan.tags.length > 3 && (
                <span className="text-xs text-muted-foreground">+{plan.tags.length - 3}</span>
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
  statusFilters: ReturnType<typeof useViewFilters>['statusFilters'];
  onToggleStatusFilter: ReturnType<typeof useViewFilters>['toggleStatusFilter'];
  tagFilters: ReturnType<typeof useViewFilters>['tagFilters'];
  onToggleTagFilter: ReturnType<typeof useViewFilters>['toggleTagFilter'];
  allPlans: PlanIndexEntry[];
}

function FilterBar({
  ownershipFilter,
  onOwnershipFilterChange,
  statusFilters,
  onToggleStatusFilter,
  tagFilters,
  onToggleTagFilter,
  allPlans,
}: FilterBarProps) {
  const allTags = getAllTagsFromIndex(allPlans);
  return (
    <div className="flex items-center gap-2">
      {/* Ownership Tabs */}
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
          onClick={() => onOwnershipFilterChange('my-plans')}
          className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
            ownershipFilter === 'my-plans'
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

      {/* Filter Button */}
      <Popover>
        <Button variant="ghost" size="sm" className="gap-2">
          <Filter className="w-4 h-4" />
          Filter
          {statusFilters.length > 0 && (
            <span className="ml-1 px-1.5 py-0.5 text-xs bg-accent/20 text-accent rounded">
              {statusFilters.length}
            </span>
          )}
        </Button>

        <Popover.Content placement="bottom end" className="w-64">
          <Popover.Dialog>
            <Popover.Arrow />
            <Popover.Heading>Filter by Status</Popover.Heading>
            <div className="mt-3 space-y-2">
              {STATUS_FILTER_OPTIONS.map((option) => (
                <Checkbox
                  key={option.value}
                  isSelected={statusFilters.includes(option.value)}
                  onChange={() => onToggleStatusFilter(option.value)}
                  className="w-full"
                >
                  {option.label}
                </Checkbox>
              ))}
            </div>
          </Popover.Dialog>
        </Popover.Content>
      </Popover>

      {/* Tag Filter */}
      {allTags.length > 0 && (
        <Popover>
          <Button variant="ghost" size="sm" className="gap-2">
            <Filter className="w-4 h-4" />
            Tags
            {tagFilters.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 text-xs bg-accent/20 text-accent rounded">
                {tagFilters.length}
              </span>
            )}
          </Button>

          <Popover.Content placement="bottom end" className="w-64">
            <Popover.Dialog>
              <Popover.Arrow />
              <Popover.Heading>Filter by Tags</Popover.Heading>
              <div className="mt-3 space-y-2 max-h-64 overflow-y-auto">
                {allTags.map((tag) => (
                  <Checkbox
                    key={tag}
                    isSelected={tagFilters.includes(tag)}
                    onChange={() => onToggleTagFilter(tag)}
                    className="w-full"
                  >
                    <div className="flex items-center gap-2">
                      <TagChip tag={tag} />
                    </div>
                  </Checkbox>
                ))}
              </div>
            </Popover.Dialog>
          </Popover.Content>
        </Popover>
      )}

      {/* Display Button (placeholder) */}
      <Button variant="ghost" size="sm" className="gap-2" isDisabled>
        <LayoutGrid className="w-4 h-4" />
        Display
      </Button>
    </div>
  );
}

type OwnershipFilter = 'all' | 'my-plans' | 'shared';

export function SearchPage() {
  const { identity: githubIdentity } = useGitHubAuth();
  const { myPlans, sharedPlans, inboxPlans, isLoading, timedOut } = usePlanIndex(
    githubIdentity?.username
  );
  useMultiProviderSync(PLAN_INDEX_DOC_NAME); // Keep index synced
  const navigate = useNavigate();
  const location = useLocation();

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [ownershipFilter, setOwnershipFilter] = useState<OwnershipFilter>('all');
  const { statusFilters, toggleStatusFilter, tagFilters, toggleTagFilter } = useViewFilters();

  // Selected plan state - read from URL on mount
  const searchParams = new URLSearchParams(location.search);
  const initialPanelId = searchParams.get('panel');

  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(initialPanelId);

  // Combine all plans for search (exclude archived by default)
  const allPlans = useMemo(() => {
    // Remove duplicates by using a Map keyed by plan id
    const planMap = new Map<string, PlanIndexEntry>();
    for (const plan of [...inboxPlans, ...myPlans, ...sharedPlans]) {
      planMap.set(plan.id, plan);
    }
    return Array.from(planMap.values());
  }, [inboxPlans, myPlans, sharedPlans]);

  // Apply ownership filter
  const ownershipFilteredPlans = useMemo(() => {
    switch (ownershipFilter) {
      case 'my-plans':
        return myPlans;
      case 'shared':
        return sharedPlans;
      default:
        return allPlans;
    }
  }, [ownershipFilter, myPlans, sharedPlans, allPlans]);

  // Filter by search query and status
  const filteredPlans = useMemo(() => {
    let plans = ownershipFilteredPlans;

    // Search query filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      plans = plans.filter((plan) => plan.title.toLowerCase().includes(query));
    }

    // Status filter
    if (statusFilters.length > 0) {
      plans = plans.filter((plan) => statusFilters.includes(plan.status));
    }

    // Tag filter (OR logic - match ANY selected tag)
    if (tagFilters.length > 0) {
      plans = plans.filter((plan) => plan.tags?.some((tag) => tagFilters.includes(tag)));
    }

    return plans;
  }, [ownershipFilteredPlans, searchQuery, statusFilters, tagFilters]);

  // Sort by updated time
  const sortedPlans = useMemo(() => {
    return [...filteredPlans].sort((a, b) => b.updatedAt - a.updatedAt);
  }, [filteredPlans]);

  // Clear selected plan if it's filtered out
  useEffect(() => {
    if (selectedPlanId && !sortedPlans.find((p) => p.id === selectedPlanId)) {
      setSelectedPlanId(null);
    }
  }, [selectedPlanId, sortedPlans]);

  // Update URL when panel state changes
  useEffect(() => {
    let mounted = true;

    if (mounted) {
      if (selectedPlanId) {
        navigate(`?panel=${selectedPlanId}`, { replace: true });
      } else {
        navigate('', { replace: true });
      }
    }

    return () => {
      mounted = false;
    };
  }, [selectedPlanId, navigate]);

  // Panel handlers
  const handleClosePanel = useCallback(() => {
    setSelectedPlanId(null);
  }, []);

  // Keyboard shortcuts for panel
  useKeyboardShortcuts({
    onFullScreen: useCallback(() => {
      if (selectedPlanId) {
        setSidebarCollapsed(true);
        navigate(`/plan/${selectedPlanId}`);
      }
    }, [selectedPlanId, navigate]),
    onClose: handleClosePanel,
    onNextItem: useCallback(() => {
      if (!selectedPlanId) return;
      const currentIndex = sortedPlans.findIndex((p) => p.id === selectedPlanId);
      if (currentIndex < sortedPlans.length - 1) {
        const nextPlan = sortedPlans[currentIndex + 1];
        if (nextPlan) {
          setSelectedPlanId(nextPlan.id);
        }
      }
    }, [selectedPlanId, sortedPlans]),
    onPrevItem: useCallback(() => {
      if (!selectedPlanId) return;
      const currentIndex = sortedPlans.findIndex((p) => p.id === selectedPlanId);
      if (currentIndex > 0) {
        const prevPlan = sortedPlans[currentIndex - 1];
        if (prevPlan) {
          setSelectedPlanId(prevPlan.id);
        }
      }
    }, [selectedPlanId, sortedPlans]),
  });

  const handleListSelection = (keys: Set<unknown> | 'all') => {
    if (keys === 'all') return;
    const key = Array.from(keys)[0];
    if (key) {
      setSelectedPlanId(String(key));
    }
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div
      className={`h-full ${selectedPlanId ? 'grid grid-cols-[minmax(300px,400px)_1fr]' : 'flex flex-col'}`}
    >
      {/* Search input + results list */}
      <div
        className={`flex flex-col h-full overflow-hidden ${selectedPlanId ? 'border-r border-separator' : 'max-w-3xl mx-auto w-full p-4'}`}
      >
        {/* Offline banner */}
        {timedOut && <OfflineBanner />}

        {/* Header with search */}
        <div className={`border-b border-separator shrink-0 ${selectedPlanId ? 'p-4' : 'mb-4'}`}>
          <h1 className="text-xl font-bold text-foreground mb-3">Search</h1>
          <SearchPlanInput
            aria-label="Search tasks"
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search tasks..."
            className="w-full mb-3"
          />

          {/* Filter Bar - Linear Style */}
          <FilterBar
            ownershipFilter={ownershipFilter}
            onOwnershipFilterChange={setOwnershipFilter}
            statusFilters={statusFilters}
            onToggleStatusFilter={toggleStatusFilter}
            tagFilters={tagFilters}
            onToggleTagFilter={toggleTagFilter}
            allPlans={allPlans}
          />
        </div>

        {/* Results */}
        <div className={`flex-1 overflow-y-auto ${selectedPlanId ? 'p-2' : ''}`}>
          {/* No search query and no filters - prompt to search */}
          {!searchQuery && statusFilters.length === 0 && tagFilters.length === 0 && (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <Search className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                <p className="text-muted-foreground">Type to search tasks or use filters</p>
              </div>
            </div>
          )}

          {/* No results */}
          {(searchQuery || statusFilters.length > 0 || tagFilters.length > 0) &&
            sortedPlans.length === 0 && (
              <div className="flex items-center justify-center py-12">
                <div className="text-center">
                  <p className="text-muted-foreground">
                    No tasks match your search
                    {searchQuery && ` for "${searchQuery}"`}
                  </p>
                </div>
              </div>
            )}

          {/* Results */}
          {(searchQuery || statusFilters.length > 0 || tagFilters.length > 0) &&
            sortedPlans.length > 0 && (
              <>
                <p className="text-sm text-muted-foreground px-2 mb-2">
                  {sortedPlans.length} {sortedPlans.length === 1 ? 'result' : 'results'}
                </p>
                <ListBox
                  aria-label="Search results"
                  selectionMode="single"
                  selectedKeys={selectedPlanId ? new Set([selectedPlanId]) : new Set()}
                  onSelectionChange={handleListSelection}
                  className="divide-y divide-separator"
                >
                  {sortedPlans.map((plan) => (
                    <ListBoxItem
                      id={plan.id}
                      key={plan.id}
                      textValue={plan.title}
                      className="px-3 rounded-lg hover:bg-surface"
                    >
                      <SearchResultItem plan={plan} />
                    </ListBoxItem>
                  ))}
                </ListBox>
              </>
            )}
        </div>
      </div>

      {/* Right: Detail panel */}
      <div className="flex flex-col h-full overflow-hidden">
        <InlinePlanDetail
          planId={selectedPlanId}
          onClose={handleClosePanel}
          emptyMessage="Select a task to view details"
        />
      </div>
    </div>
  );
}
