import { Link, useParams } from 'react-router-dom';
import { usePlanIndex } from '@/hooks/usePlanIndex';
import { cn } from '@/lib/utils';

export function Sidebar() {
  const { plans, connected, synced, serverCount, activeCount } = usePlanIndex();
  const { id: currentPlanId } = useParams<{ id: string }>();

  // Determine status text
  const getStatusText = () => {
    if (!connected) return 'Offline';
    if (!synced) return 'Syncing...';
    return 'Synced';
  };

  // Show peer count info
  const getPeerInfo = () => {
    if (serverCount === 0) return null;
    if (activeCount === serverCount) {
      return `(${activeCount} peer${activeCount !== 1 ? 's' : ''})`;
    }
    // Show both counts when some are disconnected
    return `(${activeCount}/${serverCount} peers)`;
  };

  return (
    <aside className="w-64 border-r border-gray-200 bg-white h-screen flex flex-col">
      <div className="p-4 border-b border-gray-200">
        <h2 className="font-semibold text-lg">Plans</h2>
        <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
          <span
            className={cn('w-2 h-2 rounded-full', connected ? 'bg-green-500' : 'bg-gray-300')}
          />
          {getStatusText()}
          {getPeerInfo() && <span>{getPeerInfo()}</span>}
        </div>
      </div>

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
    </aside>
  );
}
