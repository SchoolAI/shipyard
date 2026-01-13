/**
 * Archive Page - Shows archived plans with unarchive capability.
 */

import { Button, ListBox, ListBoxItem, SearchField } from '@heroui/react';
import type { PlanIndexEntry } from '@peer-plan/schema';
import { getPlanIndexEntry, PLAN_INDEX_DOC_NAME, setPlanIndexEntry } from '@peer-plan/schema';
import { ArchiveRestore } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useGitHubAuth } from '@/hooks/useGitHubAuth';
import { useMultiProviderSync } from '@/hooks/useMultiProviderSync';
import { usePlanIndex } from '@/hooks/usePlanIndex';

// --- Archive Item Component ---

interface ArchiveItemProps {
  plan: PlanIndexEntry;
  onUnarchive: (planId: string) => void;
}

function ArchiveItem({ plan, onUnarchive }: ArchiveItemProps) {
  const navigate = useNavigate();

  return (
    <div className="flex items-center justify-between gap-3 w-full py-2">
      <button
        type="button"
        className="flex flex-col gap-1 flex-1 min-w-0 cursor-pointer text-left"
        onClick={() => navigate(`/plan/${plan.id}`)}
      >
        <span className="font-medium text-foreground truncate opacity-70">{plan.title}</span>
        <span className="text-xs text-muted-foreground">
          Archived {formatRelativeTime(plan.deletedAt || plan.updatedAt)}
        </span>
      </button>

      <Button
        isIconOnly
        variant="ghost"
        size="sm"
        aria-label="Unarchive plan"
        onPress={(e) => {
          e.continuePropagation?.();
          onUnarchive(plan.id);
        }}
        className="w-8 h-8"
      >
        <ArchiveRestore className="w-4 h-4" />
      </Button>
    </div>
  );
}

// --- Helper Functions ---

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

// --- Main Page Component ---

export function ArchivePage() {
  const navigate = useNavigate();
  const { identity: githubIdentity } = useGitHubAuth();
  const { archivedPlans } = usePlanIndex(githubIdentity?.username);
  const { ydoc: indexDoc } = useMultiProviderSync(PLAN_INDEX_DOC_NAME);
  const [searchQuery, setSearchQuery] = useState('');

  // Sort by most recently archived first, then filter by search
  const sortedArchivedPlans = useMemo(() => {
    const sorted = [...archivedPlans].sort(
      (a, b) => (b.deletedAt || b.updatedAt) - (a.deletedAt || a.updatedAt)
    );
    if (!searchQuery.trim()) {
      return sorted;
    }
    const query = searchQuery.toLowerCase();
    return sorted.filter((plan) => plan.title.toLowerCase().includes(query));
  }, [archivedPlans, searchQuery]);

  const handleUnarchive = async (planId: string) => {
    if (!githubIdentity) {
      toast.error('Please sign in with GitHub first');
      return;
    }

    const now = Date.now();

    // Update the plan's own metadata
    try {
      const planDoc = new (await import('yjs')).Doc();
      const idb = new (await import('y-indexeddb')).IndexeddbPersistence(planId, planDoc);
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

    // Update plan-index
    const entry = getPlanIndexEntry(indexDoc, planId);
    if (entry) {
      const { deletedAt: _removed1, deletedBy: _removed2, ...rest } = entry;
      setPlanIndexEntry(indexDoc, {
        ...rest,
        updatedAt: now,
      });
    }

    toast.success('Plan unarchived');
  };

  // Empty state
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
    <div className="h-full flex flex-col p-4 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex flex-col gap-3 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">Archive</h1>
            <p className="text-sm text-muted-foreground">
              {sortedArchivedPlans.length}{' '}
              {sortedArchivedPlans.length === 1 ? 'archived plan' : 'archived plans'}
              {searchQuery && archivedPlans.length !== sortedArchivedPlans.length && (
                <span className="text-muted-foreground">
                  {' '}
                  (filtered from {archivedPlans.length})
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Search Field */}
        <SearchField
          aria-label="Search archive"
          value={searchQuery}
          onChange={setSearchQuery}
          onClear={() => setSearchQuery('')}
        >
          <SearchField.Group>
            <SearchField.SearchIcon />
            <SearchField.Input placeholder="Search archive..." className="w-full" />
            <SearchField.ClearButton />
          </SearchField.Group>
        </SearchField>
      </div>

      {/* Plan list */}
      <div className="flex-1 overflow-y-auto">
        {sortedArchivedPlans.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <p className="text-muted-foreground">No plans match "{searchQuery}"</p>
              <Button variant="ghost" size="sm" onPress={() => setSearchQuery('')} className="mt-2">
                Clear search
              </Button>
            </div>
          </div>
        ) : (
          <ListBox
            aria-label="Archived plans"
            selectionMode="single"
            onSelectionChange={(keys) => {
              const key = Array.from(keys)[0];
              if (key) {
                navigate(`/plan/${key}`);
              }
            }}
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
  );
}
