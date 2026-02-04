import { Info } from 'lucide-react';

export function DaemonWarning() {
  return (
    <div className="px-3 py-2 rounded-lg bg-warning/10 border border-warning/20">
      <div className="flex items-start gap-2">
        <Info className="w-4 h-4 text-warning mt-0.5 shrink-0" />
        <p className="text-sm text-warning">
          Server not connected. Task will be created but no agent will be launched.
        </p>
      </div>
    </div>
  );
}
