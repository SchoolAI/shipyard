import { Button } from '@heroui/react';
import type { PlanSnapshot } from '@shipyard/schema';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Format time distance to now (e.g., "2 hours ago")
 * Simple implementation without date-fns dependency
 */
function formatDistanceToNow(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  return `${weeks}w ago`;
}

interface VersionSelectorProps {
  /** Current snapshot being viewed (null = current/live version) */
  currentSnapshot: PlanSnapshot | null;
  /** Total number of snapshots available */
  totalSnapshots: number;
  /** Current version index (0-based, -1 = current) */
  currentIndex: number;
  /** Can navigate to previous version */
  canGoPrevious: boolean;
  /** Can navigate to next version */
  canGoNext: boolean;
  /** Navigate to previous version */
  onPrevious: () => void;
  /** Navigate to next version */
  onNext: () => void;
  /** Go to current/live version */
  onCurrent: () => void;
}

/**
 * Version selector with prev/next chevrons.
 * Shows which version is being viewed and allows navigation.
 */
export function VersionSelector({
  currentSnapshot,
  totalSnapshots,
  currentIndex,
  canGoPrevious,
  canGoNext,
  onPrevious,
  onNext,
  onCurrent,
}: VersionSelectorProps) {
  // Don't show if no snapshots exist
  if (totalSnapshots === 0) return null;

  const isViewingHistory = currentSnapshot !== null;
  const versionNumber = isViewingHistory ? currentIndex + 1 : totalSnapshots + 1; // +1 for current
  const totalVersions = totalSnapshots + 1; // Include current version

  return (
    <div className="flex items-center gap-2 text-sm">
      {/* Return to current button (when viewing history) - on left to avoid shifting navigation */}
      {isViewingHistory && (
        <Button size="sm" variant="secondary" onPress={onCurrent} className="mr-2">
          View Current
        </Button>
      )}

      {/* Previous version button */}
      <Button
        size="sm"
        variant="ghost"
        onPress={onPrevious}
        isDisabled={!canGoPrevious}
        className="min-w-0 px-2"
        aria-label="Previous version"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>

      {/* Version indicator */}
      <div className="flex flex-col items-center min-w-[140px]">
        <span className="text-xs text-muted-foreground font-medium">
          Version {versionNumber} of {totalVersions}
        </span>
        {isViewingHistory && currentSnapshot && (
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(currentSnapshot.createdAt)}
          </span>
        )}
      </div>

      {/* Next version button */}
      <Button
        size="sm"
        variant="ghost"
        onPress={onNext}
        isDisabled={!canGoNext}
        className="min-w-0 px-2"
        aria-label="Next version"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
