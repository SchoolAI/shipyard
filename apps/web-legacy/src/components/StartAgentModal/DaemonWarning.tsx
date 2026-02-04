/**
 * Warning shown when daemon is not connected.
 */

import { Info } from 'lucide-react';

/**
 * Warning message shown when daemon is not connected.
 * Informs user that task will be created but no agent will launch.
 */
export function DaemonWarning() {
  return (
    <div className="px-3 py-2 rounded-lg bg-warning/10 border border-warning/20">
      <div className="flex items-start gap-2">
        <Info className="w-4 h-4 text-warning mt-0.5 shrink-0" />
        <p className="text-sm text-warning">
          Daemon not connected. Task will be created but no agent will be launched.
        </p>
      </div>
    </div>
  );
}
