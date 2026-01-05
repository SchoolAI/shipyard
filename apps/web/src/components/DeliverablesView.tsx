import { Package } from 'lucide-react';

interface DeliverablesViewProps {
  planId: string;
}

/**
 * Stub component for the Deliverables view.
 * Will show what the AI commits to deliver (tasks, artifacts, links).
 */
export function DeliverablesView({ planId }: DeliverablesViewProps) {
  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="text-center py-16">
        <Package className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
        <h2 className="text-lg font-medium text-foreground mb-2">Deliverables</h2>
        <p className="text-muted-foreground">Track what the AI commits to deliver for this plan.</p>
        <p className="text-sm text-muted-foreground mt-4">Plan ID: {planId}</p>
      </div>
    </div>
  );
}
