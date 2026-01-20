import { Chip } from '@heroui/react';
import { getPlanEvents, getPlanMetadata, YDOC_KEYS } from '@peer-plan/schema';
import { AlertOctagon, HelpCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type * as Y from 'yjs';

interface AgentRequestsBadgeProps {
  ydoc: Y.Doc;
  isSnapshot?: boolean;
}

export function AgentRequestsBadge({ ydoc, isSnapshot = false }: AgentRequestsBadgeProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [counts, setCounts] = useState<{
    help: number;
    blocker: number;
  }>({ help: 0, blocker: 0 });

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();

    // Get plan ID from metadata to construct URL
    const metadata = getPlanMetadata(ydoc);
    if (!metadata) return;

    // Navigate to activity tab
    const searchParams = new URLSearchParams(location.search);
    searchParams.set('tab', 'activity');
    navigate(`/plan/${metadata.id}?${searchParams.toString()}`);
  };

  useEffect(() => {
    let mounted = true;

    const update = () => {
      if (!mounted) return;

      const events = getPlanEvents(ydoc);
      const metadata = getPlanMetadata(ydoc);

      // Don't show badge for completed, archived, or snapshot plans
      if (!metadata || metadata.status === 'completed' || metadata.archivedAt || isSnapshot) {
        setCounts({ help: 0, blocker: 0 });
        return;
      }

      // Find all help_request and blocker events
      const agentActivityEvents = events.filter((e) => e.type === 'agent_activity');

      const helpRequests = agentActivityEvents.filter(
        (e) => e.data.activityType === 'help_request'
      );

      const blockers = agentActivityEvents.filter((e) => e.data.activityType === 'blocker');

      // Get resolved requestIds
      const resolvedRequestIds = new Set(
        agentActivityEvents
          .filter(
            (e) =>
              e.data.activityType === 'help_request_resolved' ||
              e.data.activityType === 'blocker_resolved'
          )
          .map((e) => e.data.requestId)
      );

      // Count unresolved requests
      const unresolvedHelp = helpRequests.filter(
        (e) => !resolvedRequestIds.has(e.data.requestId)
      ).length;

      const unresolvedBlockers = blockers.filter(
        (e) => !resolvedRequestIds.has(e.data.requestId)
      ).length;

      setCounts({ help: unresolvedHelp, blocker: unresolvedBlockers });
    };

    const eventsArray = ydoc.getArray(YDOC_KEYS.EVENTS);
    const metadataMap = ydoc.getMap(YDOC_KEYS.METADATA);

    update();
    eventsArray.observe(update);
    metadataMap.observe(update);

    return () => {
      mounted = false;
      eventsArray.unobserve(update);
      metadataMap.unobserve(update);
    };
  }, [ydoc, isSnapshot]);

  // Blockers take priority (more critical)
  if (counts.blocker > 0) {
    return (
      <Chip
        color="danger"
        variant="soft"
        onClick={handleClick}
        className="cursor-pointer hover:opacity-80 transition-opacity"
      >
        <div className="flex items-center gap-1">
          <AlertOctagon className="w-3 h-3" />
          <span>Agent: Blocked{counts.blocker > 1 ? ` (${counts.blocker})` : ''}</span>
        </div>
      </Chip>
    );
  }

  if (counts.help > 0) {
    return (
      <Chip
        color="warning"
        variant="soft"
        onClick={handleClick}
        className="cursor-pointer hover:opacity-80 transition-opacity"
      >
        <div className="flex items-center gap-1">
          <HelpCircle className="w-3 h-3" />
          <span>Agent: Needs Help{counts.help > 1 ? ` (${counts.help})` : ''}</span>
        </div>
      </Chip>
    );
  }

  return null;
}
