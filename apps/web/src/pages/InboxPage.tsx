/**
 * Inbox Page - Shows plans needing review (pending_review or changes_requested).
 * Includes search filtering for finding specific inbox items.
 */

import { Button, Chip, ListBox, ListBoxItem, SearchField, Tooltip } from '@heroui/react';
import type { PlanIndexEntry, PlanStatusType } from '@peer-plan/schema';
import { getPlanIndexEntry, PLAN_INDEX_DOC_NAME, setPlanIndexEntry } from '@peer-plan/schema';
import { AlertTriangle, Check, Clock, ExternalLink, MessageSquare } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { IndexeddbPersistence } from 'y-indexeddb';
import * as Y from 'yjs';
import { InboxSkeleton } from '@/components/ui/InboxSkeleton';
import { useGitHubAuth } from '@/hooks/useGitHubAuth';
import { useMultiProviderSync } from '@/hooks/useMultiProviderSync';
import { usePlanIndex } from '@/hooks/usePlanIndex';
import { formatRelativeTime } from '@/utils/formatters';

interface StatusBadgeProps {
  status: PlanStatusType;
}

function StatusBadge({ status }: StatusBadgeProps) {
  const config: Record<
    PlanStatusType,
    {
      label: string;
      color: 'warning' | 'danger' | 'success' | 'default' | 'accent';
      icon: React.ReactNode;
    }
  > = {
    pending_review: {
      label: 'Pending Review',
      color: 'warning',
      icon: <Clock className="w-3 h-3" />,
    },
    changes_requested: {
      label: 'Changes Requested',
      color: 'danger',
      icon: <AlertTriangle className="w-3 h-3" />,
    },
    draft: { label: 'Draft', color: 'default', icon: null },
    approved: { label: 'Approved', color: 'success', icon: <Check className="w-3 h-3" /> },
    in_progress: { label: 'In Progress', color: 'accent', icon: null },
    completed: { label: 'Completed', color: 'success', icon: <Check className="w-3 h-3" /> },
  };

  const { label, color, icon } = config[status];

  return (
    <Chip size="sm" variant="soft" color={color} className="gap-1">
      {icon}
      {label}
    </Chip>
  );
}

interface InboxItemProps {
  plan: PlanIndexEntry;
  onApprove: (planId: string) => void;
  onRequestChanges: (planId: string) => void;
  onViewPlan: (planId: string) => void;
}

function InboxItem({ plan, onApprove, onRequestChanges, onViewPlan }: InboxItemProps) {
  return (
    <div className="flex items-center justify-between gap-3 w-full py-2">
      <div className="flex flex-col gap-1 flex-1 min-w-0">
        <span className="font-medium text-foreground truncate">{plan.title}</span>
        <div className="flex items-center gap-2">
          <StatusBadge status={plan.status} />
          <span className="text-xs text-muted-foreground">
            {formatRelativeTime(plan.updatedAt)}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <Tooltip>
          <Tooltip.Trigger>
            <Button
              isIconOnly
              variant="ghost"
              size="sm"
              aria-label="Approve plan"
              onPress={() => {
                onApprove(plan.id);
              }}
              className="w-8 h-8"
            >
              <Check className="w-4 h-4" />
            </Button>
          </Tooltip.Trigger>
          <Tooltip.Content>Approve</Tooltip.Content>
        </Tooltip>

        <Tooltip>
          <Tooltip.Trigger>
            <Button
              isIconOnly
              variant="ghost"
              size="sm"
              aria-label="Request changes"
              onPress={() => {
                onRequestChanges(plan.id);
              }}
              className="w-8 h-8"
            >
              <MessageSquare className="w-4 h-4" />
            </Button>
          </Tooltip.Trigger>
          <Tooltip.Content>Request Changes</Tooltip.Content>
        </Tooltip>

        <Tooltip>
          <Tooltip.Trigger>
            <Button
              isIconOnly
              variant="ghost"
              size="sm"
              aria-label="View plan"
              onPress={() => onViewPlan(plan.id)}
              className="w-8 h-8"
            >
              <ExternalLink className="w-4 h-4" />
            </Button>
          </Tooltip.Trigger>
          <Tooltip.Content>View Plan</Tooltip.Content>
        </Tooltip>
      </div>
    </div>
  );
}

export function InboxPage() {
  const { identity: githubIdentity } = useGitHubAuth();
  const { inboxPlans, markPlanAsRead, isLoading } = usePlanIndex(githubIdentity?.username);
  const { ydoc: indexDoc } = useMultiProviderSync(PLAN_INDEX_DOC_NAME);
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');

  const sortedInboxPlans = useMemo(() => {
    const sorted = [...inboxPlans].sort((a, b) => b.updatedAt - a.updatedAt);
    if (!searchQuery.trim()) {
      return sorted;
    }
    const query = searchQuery.toLowerCase();
    return sorted.filter((plan) => plan.title.toLowerCase().includes(query));
  }, [inboxPlans, searchQuery]);

  if (isLoading) {
    return <InboxSkeleton />;
  }

  const handleApprove = async (planId: string) => {
    if (!githubIdentity) {
      toast.error('Please sign in with GitHub first');
      return;
    }

    const now = Date.now();

    const entry = getPlanIndexEntry(indexDoc, planId);
    if (entry) {
      setPlanIndexEntry(indexDoc, {
        ...entry,
        status: 'approved',
        updatedAt: now,
      });
    }

    try {
      const planDoc = new Y.Doc();
      const idb = new IndexeddbPersistence(planId, planDoc);
      await idb.whenSynced;

      planDoc.transact(() => {
        const metadata = planDoc.getMap('metadata');
        metadata.set('status', 'approved');
        metadata.set('updatedAt', now);
      });

      idb.destroy();
    } catch {
      // Plan doc may not exist locally
    }

    toast.success('Plan approved');
  };

  const handleRequestChanges = (planId: string) => {
    markPlanAsRead(planId);
    navigate(`/plan/${planId}`);
    toast.info('Navigate to add comments and request changes');
  };

  const handleViewPlan = (planId: string) => {
    markPlanAsRead(planId);
    navigate(`/plan/${planId}`);
  };

  if (inboxPlans.length === 0) {
    return (
      <div className="h-full flex items-center justify-center p-4">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-success/10 flex items-center justify-center">
            <Check className="w-8 h-8 text-success" />
          </div>
          <h1 className="text-xl font-bold text-foreground mb-2">Inbox Zero!</h1>
          <p className="text-sm text-muted-foreground">No plans need your review right now.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-4 max-w-3xl mx-auto">
      <div className="flex flex-col gap-3 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">Inbox</h1>
            <p className="text-sm text-muted-foreground">
              {sortedInboxPlans.length}{' '}
              {sortedInboxPlans.length === 1 ? 'plan needs' : 'plans need'} your review
              {searchQuery && inboxPlans.length !== sortedInboxPlans.length && (
                <span className="text-muted-foreground"> (filtered from {inboxPlans.length})</span>
              )}
            </p>
          </div>
        </div>

        <SearchField
          aria-label="Search inbox"
          value={searchQuery}
          onChange={setSearchQuery}
          onClear={() => setSearchQuery('')}
        >
          <SearchField.Group>
            <SearchField.SearchIcon />
            <SearchField.Input placeholder="Search inbox..." className="w-full" />
            <SearchField.ClearButton />
          </SearchField.Group>
        </SearchField>
      </div>

      <div className="flex-1 overflow-y-auto">
        {sortedInboxPlans.length === 0 ? (
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
            aria-label="Inbox plans"
            selectionMode="single"
            onSelectionChange={(keys) => {
              const key = Array.from(keys)[0];
              if (key) {
                markPlanAsRead(String(key));
                navigate(`/plan/${key}`);
              }
            }}
            className="divide-y divide-separator"
          >
            {sortedInboxPlans.map((plan) => (
              <ListBoxItem
                id={plan.id}
                key={plan.id}
                textValue={plan.title}
                className="px-3 rounded-lg hover:bg-surface"
              >
                <InboxItem
                  plan={plan}
                  onApprove={handleApprove}
                  onRequestChanges={handleRequestChanges}
                  onViewPlan={handleViewPlan}
                />
              </ListBoxItem>
            ))}
          </ListBox>
        )}
      </div>
    </div>
  );
}
