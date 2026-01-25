import { Chip } from '@heroui/react';
import {
  type AnyInputRequest,
  getPlanMetadata,
  type PlanMetadata,
  YDOC_KEYS,
} from '@shipyard/schema';
import { AlertOctagon, MessageSquare } from 'lucide-react';
import { useEffect, useState } from 'react';
import type * as Y from 'yjs';

interface AgentRequestsBadgeProps {
  ydoc: Y.Doc;
  isSnapshot?: boolean;
}

/**
 * Custom event to switch the PlanContent tab.
 * Dispatched by badge clicks, listened to by PlanContent.
 */
export type SwitchTabEventDetail = {
  tab: 'plan' | 'activity' | 'deliverables' | 'changes';
};

export function AgentRequestsBadge({ ydoc, isSnapshot = false }: AgentRequestsBadgeProps) {
  const [counts, setCounts] = useState<{
    input: number;
    blocker: number;
  }>({ input: 0, blocker: 0 });

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();

    // Dispatch custom event to switch tab - PlanContent listens for this
    const event = new CustomEvent<SwitchTabEventDetail>('switch-plan-tab', {
      detail: { tab: 'activity' },
      bubbles: true,
    });
    document.dispatchEvent(event);
  };

  useEffect(() => {
    let mounted = true;

    const update = () => {
      if (!mounted) return;

      const metadata = getPlanMetadata(ydoc);

      // Don't show badge for completed, archived, or snapshot plans
      if (!metadata || metadata.status === 'completed' || metadata.archivedAt || isSnapshot) {
        setCounts({ input: 0, blocker: 0 });
        return;
      }

      // Count pending input requests (from plan-index, filtered by this planId)
      const requestsArray = ydoc.getArray<AnyInputRequest>(YDOC_KEYS.INPUT_REQUESTS);
      const allRequests = requestsArray.toJSON() as AnyInputRequest[];
      const pendingRequests = allRequests.filter(
        (r) => r.status === 'pending' && r.planId === metadata.id
      );

      // Separate blockers from normal input requests
      const blockerCount = pendingRequests.filter((r) => r.isBlocker).length;
      const normalCount = pendingRequests.filter((r) => !r.isBlocker).length;

      setCounts({ input: normalCount, blocker: blockerCount });
    };

    const requestsArray = ydoc.getArray(YDOC_KEYS.INPUT_REQUESTS);
    const metadataMap = ydoc.getMap<PlanMetadata>(YDOC_KEYS.METADATA);

    update();
    requestsArray.observe(update);
    metadataMap.observe(update);

    return () => {
      mounted = false;
      requestsArray.unobserve(update);
      metadataMap.unobserve(update);
    };
  }, [ydoc, isSnapshot]);

  // Blockers take priority (more critical)
  if (counts.blocker > 0) {
    return (
      <button
        type="button"
        onClick={handleClick}
        className="cursor-pointer hover:opacity-80 transition-opacity focus:outline-none focus:ring-2 focus:ring-danger rounded-full"
      >
        <Chip color="danger" variant="soft">
          <div className="flex items-center gap-1">
            <AlertOctagon className="w-3 h-3" />
            <span>Agent: Blocked{counts.blocker > 1 ? ` (${counts.blocker})` : ''}</span>
          </div>
        </Chip>
      </button>
    );
  }

  if (counts.input > 0) {
    return (
      <button
        type="button"
        onClick={handleClick}
        className="cursor-pointer hover:opacity-80 transition-opacity focus:outline-none focus:ring-2 focus:ring-accent rounded-full"
      >
        <Chip color="accent" variant="soft">
          <div className="flex items-center gap-1">
            <MessageSquare className="w-3 h-3" />
            <span>Agent: Needs Input{counts.input > 1 ? ` (${counts.input})` : ''}</span>
          </div>
        </Chip>
      </button>
    );
  }

  return null;
}
