/**
 * Search Page - Global search across all plans.
 * Two-column layout with search input + results list on left and detail panel on right.
 */

import { ListBox, ListBoxItem, Spinner } from '@heroui/react';
import { PLAN_INDEX_DOC_NAME, type PlanIndexEntry } from '@peer-plan/schema';
import { Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { InlinePlanDetail } from '@/components/InlinePlanDetail';
import { StatusChip } from '@/components/StatusChip';
import { SearchPlanInput } from '@/components/ui/SearchPlanInput';
import { useGitHubAuth } from '@/hooks/useGitHubAuth';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useMultiProviderSync } from '@/hooks/useMultiProviderSync';
import { usePlanIndex } from '@/hooks/usePlanIndex';
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
        <div className="flex items-center gap-2">
          <StatusChip status={plan.status} />
          <span className="text-xs text-muted-foreground">
            {formatRelativeTime(plan.updatedAt)}
          </span>
        </div>
      </div>
    </div>
  );
}

export function SearchPage() {
  const { identity: githubIdentity } = useGitHubAuth();
  const { myPlans, sharedPlans, inboxPlans, isLoading } = usePlanIndex(githubIdentity?.username);
  useMultiProviderSync(PLAN_INDEX_DOC_NAME); // Keep index synced
  const navigate = useNavigate();
  const location = useLocation();

  // Search state
  const [searchQuery, setSearchQuery] = useState('');

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

  // Filter by search query
  const filteredPlans = useMemo(() => {
    if (!searchQuery.trim()) return allPlans;
    const query = searchQuery.toLowerCase();
    return allPlans.filter((plan) => plan.title.toLowerCase().includes(query));
  }, [allPlans, searchQuery]);

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
        {/* Header with search */}
        <div className={`border-b border-separator shrink-0 ${selectedPlanId ? 'p-4' : 'mb-4'}`}>
          <h1 className="text-xl font-bold text-foreground mb-3">Search</h1>
          <SearchPlanInput
            aria-label="Search plans"
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search plans..."
            className="w-full"
          />
        </div>

        {/* Results */}
        <div className={`flex-1 overflow-y-auto ${selectedPlanId ? 'p-2' : ''}`}>
          {/* No search query - prompt to search */}
          {!searchQuery && (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <Search className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                <p className="text-muted-foreground">Type to search plans</p>
              </div>
            </div>
          )}

          {/* Search query but no results */}
          {searchQuery && sortedPlans.length === 0 && (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <p className="text-muted-foreground">No plans match "{searchQuery}"</p>
              </div>
            </div>
          )}

          {/* Search results */}
          {searchQuery && sortedPlans.length > 0 && (
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
          width="expanded"
          emptyMessage="Select a plan to view details"
        />
      </div>
    </div>
  );
}
