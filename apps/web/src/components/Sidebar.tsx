import type { PlanIndexEntry } from '@peer-plan/schema';
import { useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { CollapsiblePanel, CollapsiblePanelHeader } from '@/components/ui/collapsible-panel';
import { useActivePlanSync } from '@/contexts/ActivePlanSyncContext';
import { usePlanIndex } from '@/hooks/usePlanIndex';
import { useSharedPlans } from '@/hooks/useSharedPlans';
import { cn } from '@/lib/utils';
import { getSidebarCollapsed, setSidebarCollapsed } from '@/utils/uiPreferences';

interface PlanLinkProps {
  plan: PlanIndexEntry;
  badge?: string;
  activeBadge?: string;
  peerCount?: number;
}

function PlanLink({ plan, badge, activeBadge, peerCount }: PlanLinkProps) {
  return (
    <NavLink
      to={`/plan/${plan.id}`}
      className={({ isActive }) =>
        cn(
          'block px-3 py-2 rounded-md text-sm transition-colors',
          isActive ? 'bg-blue-100 text-blue-900' : 'text-gray-700 hover:bg-gray-100'
        )
      }
    >
      {({ isActive }) => {
        const displayBadge = isActive && activeBadge ? activeBadge : badge;
        const showPeerCount = isActive && peerCount !== undefined && peerCount > 0;

        return (
          <div className="flex items-center justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{plan.title}</div>
              <div className="text-xs text-gray-500">{plan.status.replace('_', ' ')}</div>
            </div>
            {(displayBadge || showPeerCount) && (
              <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded shrink-0">
                {showPeerCount
                  ? `${displayBadge} • ${peerCount} ${peerCount === 1 ? 'peer' : 'peers'}`
                  : displayBadge}
              </span>
            )}
          </div>
        );
      }}
    </NavLink>
  );
}

export function Sidebar() {
  const { plans: localPlans, activeCount } = usePlanIndex();
  const { activePlanId, syncState } = useActivePlanSync();
  const [collapsed, setCollapsed] = useState(getSidebarCollapsed);

  // Memoize plan IDs to prevent infinite re-renders in useSharedPlans
  const localPlanIds = useMemo(() => localPlans.map((p) => p.id), [localPlans]);
  const sharedPlans = useSharedPlans(localPlanIds);

  const handleToggle = () => {
    const newState = !collapsed;
    setCollapsed(newState);
    setSidebarCollapsed(newState);
  };

  return (
    <CollapsiblePanel side="left" isOpen={!collapsed} onToggle={handleToggle} className="bg-white">
      <CollapsiblePanelHeader side="left" onToggle={handleToggle} title="Plans" />

      <nav className="flex-1 overflow-y-auto p-2 space-y-4">
        {/* Local Plans - created via MCP */}
        {localPlans.length > 0 && (
          <div>
            <div className="flex items-center justify-between px-2 mb-2">
              <h3 className="text-xs font-semibold text-gray-500">Local ({localPlans.length})</h3>
              {activeCount > 0 ? (
                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">
                  Synced ({activeCount} MCP)
                </span>
              ) : (
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                  Offline
                </span>
              )}
            </div>
            <ul className="space-y-1">
              {localPlans.map((plan) => (
                <li key={plan.id}>
                  <PlanLink plan={plan} />
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
              {sharedPlans.map((plan) => {
                const isActive = activePlanId === plan.id;
                const peerCount = isActive ? syncState?.peerCount : undefined;

                return (
                  <li key={plan.id}>
                    <PlanLink
                      plan={plan}
                      badge="Shared"
                      activeBadge="Active"
                      peerCount={peerCount}
                    />
                  </li>
                );
              })}
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
