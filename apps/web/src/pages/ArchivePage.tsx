/**
 * Archive Page - Shows archived plans with unarchive capability.
 * Two-column layout with archive list on left and detail panel on right.
 */

import { Button, ListBox, ListBoxItem, Skeleton } from '@heroui/react';
import type { PlanIndexEntry } from '@peer-plan/schema';
import { getPlanIndexEntry, PLAN_INDEX_DOC_NAME, setPlanIndexEntry } from '@peer-plan/schema';
import { ArchiveRestore } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { IndexeddbPersistence } from 'y-indexeddb';
import * as Y from 'yjs';
import { InlinePlanDetail } from '@/components/InlinePlanDetail';
import { useGitHubAuth } from '@/hooks/useGitHubAuth';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useMultiProviderSync } from '@/hooks/useMultiProviderSync';
import { usePlanIndex } from '@/hooks/usePlanIndex';
import { formatRelativeTime } from '@/utils/formatters';
import { setSidebarCollapsed } from '@/utils/uiPreferences';

interface ArchiveItemProps {
  plan: PlanIndexEntry;
  onUnarchive: (planId: string) => void;
}

function ArchiveItem({ plan, onUnarchive }: ArchiveItemProps) {
  return (
    <div className="flex items-center justify-between gap-3 w-full py-2">
      <div className="flex flex-col gap-1 flex-1 min-w-0">
        <span className="font-medium text-foreground truncate opacity-70">{plan.title}</span>
        <span className="text-xs text-muted-foreground">
          Archived {formatRelativeTime(plan.deletedAt || plan.updatedAt)}
        </span>
      </div>

      <Button
        isIconOnly
        variant="ghost"
        size="sm"
        aria-label="Unarchive plan"
        onPress={() => {
          onUnarchive(plan.id);
        }}
        className="w-8 h-8"
      >
        <ArchiveRestore className="w-4 h-4" />
      </Button>
    </div>
  );
}

export function ArchivePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { identity: githubIdentity } = useGitHubAuth();
  const { archivedPlans, isLoading } = usePlanIndex(githubIdentity?.username);
  const { ydoc: indexDoc } = useMultiProviderSync(PLAN_INDEX_DOC_NAME);

  // Selected plan state - read from URL on mount
  const searchParams = new URLSearchParams(location.search);
  const initialPanelId = searchParams.get('panel');
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(initialPanelId);

  const sortedArchivedPlans = useMemo(() => {
    return [...archivedPlans].sort(
      (a, b) => (b.deletedAt || b.updatedAt) - (a.deletedAt || a.updatedAt)
    );
  }, [archivedPlans]);

  // Update URL when panel state changes
  useEffect(() => {
    if (selectedPlanId) {
      navigate(`?panel=${selectedPlanId}`, { replace: true });
    } else {
      navigate('', { replace: true });
    }
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
      const currentIndex = sortedArchivedPlans.findIndex((p) => p.id === selectedPlanId);
      if (currentIndex < sortedArchivedPlans.length - 1) {
        const nextPlan = sortedArchivedPlans[currentIndex + 1];
        if (nextPlan) {
          setSelectedPlanId(nextPlan.id);
        }
      }
    }, [selectedPlanId, sortedArchivedPlans]),
    onPrevItem: useCallback(() => {
      if (!selectedPlanId) return;
      const currentIndex = sortedArchivedPlans.findIndex((p) => p.id === selectedPlanId);
      if (currentIndex > 0) {
        const prevPlan = sortedArchivedPlans[currentIndex - 1];
        if (prevPlan) {
          setSelectedPlanId(prevPlan.id);
        }
      }
    }, [selectedPlanId, sortedArchivedPlans]),
  });

  if (isLoading) {
    return (
      <div className="h-full flex flex-col p-4 max-w-3xl mx-auto">
        <div className="flex flex-col gap-3 mb-4">
          <Skeleton className="h-6 w-20 rounded" />
          <Skeleton className="h-4 w-32 rounded" />
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
        <div className="flex-1 space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between gap-3 py-3 px-3 rounded-lg">
              <div className="flex flex-col gap-2 flex-1">
                <Skeleton className="h-5 w-48 rounded" />
                <Skeleton className="h-3 w-24 rounded" />
              </div>
              <Skeleton className="h-8 w-8 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const handleUnarchive = async (planId: string) => {
    if (!githubIdentity) {
      toast.error('Please sign in with GitHub first');
      return;
    }

    const now = Date.now();

    try {
      const planDoc = new Y.Doc();
      const idb = new IndexeddbPersistence(planId, planDoc);
      await idb.whenSynced;

      planDoc.transact(() => {
        const metadata = planDoc.getMap('metadata');
        metadata.delete('archivedAt');
        metadata.delete('archivedBy');
        metadata.set('updatedAt', now);
      });

      idb.destroy();
    } catch {
      // Plan doc may not exist locally
    }

    const entry = getPlanIndexEntry(indexDoc, planId);
    if (entry) {
      const { deletedAt: _removed1, deletedBy: _removed2, ...rest } = entry;
      setPlanIndexEntry(indexDoc, {
        ...rest,
        updatedAt: now,
      });
    }

    // Close panel if unarchiving selected plan
    if (selectedPlanId === planId) {
      setSelectedPlanId(null);
    }

    toast.success('Plan unarchived');
  };

  const handleListSelection = (keys: Set<unknown> | 'all') => {
    if (keys === 'all') return;
    const key = Array.from(keys)[0];
    if (key) {
      setSelectedPlanId(String(key));
    }
  };

  if (archivedPlans.length === 0) {
    return (
      <div className="h-full flex items-center justify-center p-4">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
            <ArchiveRestore className="w-8 h-8 text-muted-foreground" />
          </div>
          <h1 className="text-xl font-bold text-foreground mb-2">No Archived Plans</h1>
          <p className="text-sm text-muted-foreground">Your archived plans will appear here.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full grid grid-cols-[minmax(300px,400px)_1fr]">
      {/* Archive list */}
      <div className="flex flex-col h-full overflow-hidden border-r border-separator">
        {/* Header */}
        <div className="border-b border-separator shrink-0 p-4">
          <div className="mb-3">
            <h1 className="text-xl font-bold text-foreground">Archive</h1>
            <p className="text-sm text-muted-foreground">
              {sortedArchivedPlans.length}{' '}
              {sortedArchivedPlans.length === 1 ? 'archived plan' : 'archived plans'}
            </p>
          </div>
        </div>

        {/* Archive results */}
        <div className="flex-1 overflow-y-auto p-2">
          {sortedArchivedPlans.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <p className="text-muted-foreground">No archived plans</p>
              </div>
            </div>
          ) : (
            <ListBox
              aria-label="Archived plans"
              selectionMode="single"
              selectedKeys={selectedPlanId ? new Set([selectedPlanId]) : new Set()}
              onSelectionChange={handleListSelection}
              className="divide-y divide-separator"
            >
              {sortedArchivedPlans.map((plan) => (
                <ListBoxItem
                  id={plan.id}
                  key={plan.id}
                  textValue={plan.title}
                  className="px-3 rounded-lg hover:bg-surface"
                >
                  <ArchiveItem plan={plan} onUnarchive={handleUnarchive} />
                </ListBoxItem>
              ))}
            </ListBox>
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
