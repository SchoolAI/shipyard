/**
 * Progress bar component showing completion percentage and current stage.
 * Extracted from HandoffConversationDialog for reuse across the app.
 */

export function ProgressBar({ progress, stage }: { progress: number; stage: string }) {
  return (
    <div className="w-full space-y-2">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground capitalize">{stage}...</span>
        <span className="text-foreground">{Math.round(progress)}%</span>
      </div>
      <div className="h-2 w-full bg-surface-secondary rounded-full overflow-hidden">
        <div
          className="h-full bg-accent transition-all duration-300 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
