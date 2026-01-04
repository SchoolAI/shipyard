import type { PlanIndexEntry } from '@peer-plan/schema';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CollapsiblePanel, CollapsiblePanelHeader } from '@/components/ui/collapsible-panel';
import { usePlanIndex } from '@/hooks/usePlanIndex';
import { useSharedPlans } from '@/hooks/useSharedPlans';
import { cn } from '@/lib/utils';
import { formatConnectionInfo, hasAnyConnection } from '@/utils/connectionStatus';
import { getSidebarCollapsed, setSidebarCollapsed } from '@/utils/uiPreferences';

interface PlanLinkProps {
  plan: PlanIndexEntry;
  currentPlanId?: string;
  badge?: string;
}

function PlanLink({ plan, currentPlanId, badge }: PlanLinkProps) {
  return (
    <Link
      to={`/plan/${plan.id}`}
      className={cn(
        'block px-3 py-2 rounded-md text-sm transition-colors',
        currentPlanId === plan.id ? 'bg-blue-100 text-blue-900' : 'text-gray-700 hover:bg-gray-100'
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">{plan.title}</div>
          <div className="text-xs text-gray-500">{plan.status.replace('_', ' ')}</div>
        </div>
        {badge && (
          <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded shrink-0">
            {badge}
          </span>
        )}
      </div>
    </Link>
  );
}

export function Sidebar() {
  const { plans: localPlans, synced, serverCount, activeCount, peerCount } = usePlanIndex();
  const { id: currentPlanId } = useParams<{ id: string }>();
  const [collapsed, setCollapsed] = useState(getSidebarCollapsed);

  // Memoize plan IDs to prevent infinite re-renders in useSharedPlans
  const localPlanIds = useMemo(() => localPlans.map((p) => p.id), [localPlans]);
  const sharedPlans = useSharedPlans(localPlanIds);

  const handleToggle = () => {
    const newState = !collapsed;
    setCollapsed(newState);
    setSidebarCollapsed(newState);
  };

  const getStatusText = () => {
    if (!hasAnyConnection(activeCount, peerCount)) return 'Offline';
    if (!synced) return 'Syncing...';
    return 'Synced';
  };

  return (
    <CollapsiblePanel side="left" isOpen={!collapsed} onToggle={handleToggle} className="bg-white">
      <CollapsiblePanelHeader side="left" onToggle={handleToggle} title="Plans">
        <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
          <span
            className={cn(
              'w-2 h-2 rounded-full',
              hasAnyConnection(activeCount, peerCount) ? 'bg-green-500' : 'bg-gray-300'
            )}
          />
          {getStatusText()}
          {formatConnectionInfo(activeCount, serverCount, peerCount) && (
            <span>{formatConnectionInfo(activeCount, serverCount, peerCount)}</span>
          )}
        </div>
      </CollapsiblePanelHeader>

      <nav className="flex-1 overflow-y-auto p-2 space-y-4">
        {/* Local Plans - created via MCP */}
        {localPlans.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-gray-500 px-2 mb-2">
              Local ({localPlans.length})
            </h3>
            <ul className="space-y-1">
              {localPlans.map((plan) => (
                <li key={plan.id}>
                  <PlanLink plan={plan} currentPlanId={currentPlanId} />
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Shared Plans - received via P2P */}
        {sharedPlans.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-gray-500 px-2 mb-2">
              Shared with me ({sharedPlans.length})
            </h3>
            <ul className="space-y-1">
              {sharedPlans.map((plan) => (
                <li key={plan.id}>
                  <PlanLink plan={plan} currentPlanId={currentPlanId} badge="Shared" />
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Empty state */}
        {localPlans.length === 0 && sharedPlans.length === 0 && (
          <p className="text-gray-500 text-sm p-2">No plans yet</p>
        )}
      </nav>
    </CollapsiblePanel>
  );
}
