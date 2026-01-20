/**
 * Archive Page - Shows archived plans with unarchive capability.
 * Two-column layout with archive list on left and detail panel on right.
 */

import { Button, ListBox, ListBoxItem } from '@heroui/react';
import type { PlanIndexEntry } from '@shipyard/schema';
import {
  getPlanIndexEntry,
  PLAN_INDEX_DOC_NAME,
  setPlanIndexEntry,
  unarchivePlan,
} from '@shipyard/schema';
import { ArchiveRestore } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { IndexeddbPersistence } from 'y-indexeddb';
import * as Y from 'yjs';
import { InlinePlanDetail } from '@/components/InlinePlanDetail';
import { OfflineBanner } from '@/components/OfflineBanner';
import { TagChip } from '@/components/TagChip';
import { TwoColumnSkeleton } from '@/components/ui/TwoColumnSkeleton';
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
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">
            Archived {formatRelativeTime(plan.deleted ? plan.deletedAt : plan.updatedAt)}
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

      <Button
        isIconOnly
        variant="ghost"
        size="sm"
        aria-label="Unarchive task"
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
  const { archivedPlans, isLoading, timedOut } = usePlanIndex(githubIdentity?.username);
  const { ydoc: indexDoc } = useMultiProviderSync(PLAN_INDEX_DOC_NAME);

  // Selected plan state - read from URL on mount
  const searchParams = new URLSearchParams(location.search);
  const initialPanelId = searchParams.get('panel');
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(initialPanelId);

  const sortedArchivedPlans = useMemo(() => {
    return [...archivedPlans].sort(
      (a, b) => (b.deleted ? b.deletedAt : b.updatedAt) - (a.deleted ? a.deletedAt : a.updatedAt)
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
        navigate(`/task/${selectedPlanId}`);
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
    return <TwoColumnSkeleton itemCount={3} showActions={false} titleWidth="w-20" />;
  }

  const handleUnarchive = async (planId: string) => {
    if (!githubIdentity) {
      toast.error('Please sign in with GitHub first');
      return;
    }

    const actor = githubIdentity.username;

    try {
      const planDoc = new Y.Doc();
      const idb = new IndexeddbPersistence(planId, planDoc);
      await idb.whenSynced;

      unarchivePlan(planDoc, actor);

      idb.destroy();
    } catch {
      // Plan doc may not exist locally
    }

    const entry = getPlanIndexEntry(indexDoc, planId);
    if (entry) {
      setPlanIndexEntry(indexDoc, {
        id: entry.id,
        title: entry.title,
        status: entry.status,
        createdAt: entry.createdAt,
        updatedAt: Date.now(),
        ownerId: entry.ownerId,
        deleted: false,
      });
    }

    // Close panel if unarchiving selected plan
    if (selectedPlanId === planId) {
      setSelectedPlanId(null);
    }

    toast.success('Task unarchived');
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
          <h1 className="text-xl font-bold text-foreground mb-2">No Archived Tasks</h1>
          <p className="text-sm text-muted-foreground">Your archived tasks will appear here.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full grid grid-cols-[minmax(300px,400px)_1fr]">
      {/* Archive list */}
      <div className="flex flex-col h-full overflow-hidden border-r border-separator">
        {/* Offline banner */}
        {timedOut && <OfflineBanner />}

        {/* Header */}
        <div className="border-b border-separator shrink-0 p-4">
          <div className="mb-3">
            <h1 className="text-xl font-bold text-foreground">Archive</h1>
            <p className="text-sm text-muted-foreground">
              {sortedArchivedPlans.length}{' '}
              {sortedArchivedPlans.length === 1 ? 'archived task' : 'archived tasks'}
            </p>
          </div>
        </div>

        {/* Archive results */}
        <div className="flex-1 overflow-y-auto p-2">
          {sortedArchivedPlans.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <p className="text-muted-foreground">No archived tasks</p>
              </div>
            </div>
          ) : (
            <ListBox
              aria-label="Archived tasks"
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
          emptyMessage="Select a task to view details"
        />
      </div>
    </div>
  );
}
