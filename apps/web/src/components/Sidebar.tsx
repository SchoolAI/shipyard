import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CollapsiblePanel, CollapsiblePanelHeader } from '@/components/ui/collapsible-panel';
import { usePlanIndex } from '@/hooks/usePlanIndex';
import { cn } from '@/lib/utils';
import { formatConnectionInfo, hasAnyConnection } from '@/utils/connectionStatus';
import { getSidebarCollapsed, setSidebarCollapsed } from '@/utils/uiPreferences';

export function Sidebar() {
  const { plans, synced, serverCount, activeCount, peerCount } = usePlanIndex();
  const { id: currentPlanId } = useParams<{ id: string }>();
  const [collapsed, setCollapsed] = useState(getSidebarCollapsed);

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

      <nav className="flex-1 overflow-y-auto p-2">
        {plans.length === 0 ? (
          <p className="text-gray-500 text-sm p-2">No plans yet</p>
        ) : (
          <ul className="space-y-1">
            {plans.map((plan) => (
              <li key={plan.id}>
                <Link
                  to={`/plan/${plan.id}`}
                  className={cn(
                    'block px-3 py-2 rounded-md text-sm transition-colors',
                    currentPlanId === plan.id
                      ? 'bg-blue-100 text-blue-900'
                      : 'text-gray-700 hover:bg-gray-100'
                  )}
                >
                  <div className="font-medium truncate">{plan.title}</div>
                  <div className="text-xs text-gray-500">{plan.status.replace('_', ' ')}</div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </nav>
    </CollapsiblePanel>
  );
}
