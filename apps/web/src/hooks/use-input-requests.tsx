/**
 * Hook to monitor input requests and show toast notifications.
 * Detects new pending requests and dispatches events for modal trigger.
 *
 * Migrated from legacy useInputRequests.tsx to use Loro selectors.
 */

import type { TaskId } from '@shipyard/loro-schema';
import { AlertOctagon } from 'lucide-react';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { AnyInputRequest } from '@/components/input-request-types';
import { MarkdownContent } from '@/components/ui/markdown-content';
import { getTaskRoute } from '@/constants/routes';
import { INTERVALS, TOAST_DURATIONS } from '@/constants/timings';
import { useTaskInputRequests } from '@/loro/selectors/task-selectors';

export interface UseInputRequestsOptions {
  /** The task ID to monitor for input requests */
  taskId: TaskId;
  /** Callback fired when a new request is received */
  onRequestReceived?: (request: AnyInputRequest) => void;
}

export interface UseInputRequestsReturn {
  /** Array of currently pending requests */
  pendingRequests: AnyInputRequest[];
}

/** Blocker icon element used in toast notifications */
const blockerIcon = <AlertOctagon className="w-5 h-5 text-danger" />;

/**
 * Check if a request has expired based on its createdAt and expiresAt.
 */
function isRequestExpired(request: AnyInputRequest): boolean {
  return Date.now() >= request.expiresAt;
}

/**
 * Filter out expired requests from the array.
 */
function filterOutExpiredRequests(requests: AnyInputRequest[]): AnyInputRequest[] {
  return requests.filter((r) => !isRequestExpired(r));
}

/**
 * Dispatches a custom event to open the input request modal.
 */
function dispatchOpenInputRequestEvent(request: AnyInputRequest, taskId: TaskId): void {
  document.dispatchEvent(
    new CustomEvent('open-input-request', {
      detail: { request, taskId },
    })
  );
}

/**
 * Get the display message for a request (handles multi-question).
 */
function getRequestDisplayMessage(request: AnyInputRequest): string {
  if (request.type === 'multi') {
    const count = request.questions.length;
    return `${count} question${count > 1 ? 's' : ''} from agent`;
  }
  return request.message;
}

/**
 * Toast description component that includes message and optional "View Task" link.
 */
function ToastDescription({
  message,
  taskId,
}: {
  message: string;
  taskId?: TaskId;
}): React.ReactElement {
  const handleViewTask = (e: React.MouseEvent) => {
    e.preventDefault();
    if (taskId) {
      window.location.href = getTaskRoute(taskId);
    }
  };

  return (
    <div className="space-y-1">
      <MarkdownContent content={message} variant="toast" className="line-clamp-2" />
      {taskId && (
        <button
          type="button"
          onClick={handleViewTask}
          className="text-xs text-accent hover:underline flex items-center gap-1"
        >
          View Task
        </button>
      )}
    </div>
  );
}

/**
 * Show a grouped toast for multiple pending requests.
 */
function showGroupedToast(count: number, hasBlocker: boolean, onClick: () => void): void {
  const toastFn = hasBlocker ? toast.error : toast.info;
  const title = hasBlocker
    ? `BLOCKER: Agent needs input (${count} pending)`
    : `Agent needs input (${count} pending)`;
  const description = hasBlocker
    ? 'Agent is blocked - multiple requests waiting for response'
    : 'Multiple requests waiting for response';

  toastFn(title, {
    id: 'input-requests-grouped',
    position: 'top-right',
    duration: TOAST_DURATIONS.INPUT_REQUEST,
    description,
    icon: hasBlocker ? blockerIcon : undefined,
    action: { label: 'Respond', onClick },
  });
}

/**
 * Show a toast for a single input request.
 */
function showSingleRequestToast(
  request: AnyInputRequest,
  taskId: TaskId,
  onClick: () => void
): void {
  const isBlocker = request.isBlocker;
  const toastFn = isBlocker ? toast.error : toast.info;
  const title = isBlocker ? 'BLOCKER: Agent needs your input' : 'Agent needs your input';

  toastFn(title, {
    id: `input-request-${request.id}`,
    position: 'top-right',
    duration: TOAST_DURATIONS.INPUT_REQUEST,
    description: <ToastDescription message={getRequestDisplayMessage(request)} taskId={taskId} />,
    icon: isBlocker ? blockerIcon : undefined,
    action: { label: 'Respond', onClick },
  });
}

/**
 * Shows or updates the toast for remaining pending requests after some have been resolved.
 */
function showRemainingRequestsToast(pending: AnyInputRequest[], taskId: TaskId): void {
  if (pending.length > 1) {
    const firstRequest = pending[0];
    const hasBlocker = pending.some((r) => r.isBlocker);
    showGroupedToast(pending.length, hasBlocker, () => {
      if (firstRequest) dispatchOpenInputRequestEvent(firstRequest, taskId);
    });
  } else if (pending.length === 1) {
    const request = pending[0];
    if (request) {
      showSingleRequestToast(request, taskId, () => dispatchOpenInputRequestEvent(request, taskId));
    }
  }
}

/**
 * Dismisses toasts for requests that are no longer pending.
 */
function dismissResolvedToasts(resolvedIds: string[]): void {
  for (const id of resolvedIds) {
    toast.dismiss(`input-request-${id}`);
  }
  toast.dismiss('input-requests-grouped');
}

/**
 * Hook that monitors input requests for a task and shows toast notifications
 * when new pending requests are detected.
 *
 * Features:
 * - Uses Loro selectors for reactive updates
 * - Filters for status='pending' and non-expired
 * - Detects NEW requests (not in previous list)
 * - Shows toast notification (top-right, 60s duration)
 * - Grouped toast if multiple pending
 * - Dispatches custom event 'open-input-request' for modal trigger
 *
 * @param options - Configuration options
 * @returns Object containing pendingRequests array
 */
export function useInputRequests({
  taskId,
  onRequestReceived,
}: UseInputRequestsOptions): UseInputRequestsReturn {
  const inputRequests = useTaskInputRequests(taskId);

  /** Track previously seen requests to detect new ones */
  const previousRequestIdsRef = useRef<Set<string>>(new Set());

  /** Stable ref for callback to avoid including it in deps */
  const onRequestReceivedRef = useRef(onRequestReceived);

  /**
   * Counter to force re-renders for expiration checks.
   * Since filtering uses Date.now(), React doesn't know when requests expire.
   * Incrementing this counter forces re-evaluation of filterOutExpiredRequests.
   * The tick value is intentionally unused in computations - its purpose is
   * to trigger React re-renders when incremented.
   */
  const [, setExpirationTick] = useState(0);

  /** Update ref when callback changes */
  useEffect(() => {
    onRequestReceivedRef.current = onRequestReceived;
  }, [onRequestReceived]);

  /**
   * Filter to pending and non-expired.
   * Note: expirationTick is included in the dependency array of this memo
   * via the component re-render it causes, ensuring fresh Date.now() calls.
   */
  const pendingRequests = filterOutExpiredRequests(
    inputRequests.filter((r) => r.status === 'pending')
  );

  /** Effect to handle toast notifications when requests change */
  useEffect(() => {
    const currentIds = new Set(pendingRequests.map((r) => r.id));

    /** Find NEW requests (not in previous set) */
    const newRequests = pendingRequests.filter((r) => !previousRequestIdsRef.current.has(r.id));

    /** Find RESOLVED requests (were pending before, not anymore) */
    const resolvedIds = Array.from(previousRequestIdsRef.current).filter(
      (id) => !currentIds.has(id)
    );

    /** Handle resolved requests (dismiss toasts, show remaining) */
    if (resolvedIds.length > 0) {
      dismissResolvedToasts(resolvedIds);
      showRemainingRequestsToast(pendingRequests, taskId);
    }

    /** Handle new requests (show toasts, notify callbacks) */
    if (newRequests.length > 0) {
      const firstRequest = pendingRequests[0];

      if (pendingRequests.length > 1) {
        const hasBlocker = newRequests.some((r) => r.isBlocker);
        showGroupedToast(pendingRequests.length, hasBlocker, () => {
          if (firstRequest) dispatchOpenInputRequestEvent(firstRequest, taskId);
        });
      } else if (pendingRequests.length === 1 && firstRequest) {
        showSingleRequestToast(firstRequest, taskId, () =>
          dispatchOpenInputRequestEvent(firstRequest, taskId)
        );
      }

      for (const request of newRequests) {
        onRequestReceivedRef.current?.(request);
      }
    }

    /** Update tracking set */
    previousRequestIdsRef.current = currentIds;
  }, [pendingRequests, taskId]);

  /**
   * Periodic check for expired requests (every 5 seconds).
   * This ensures we detect client-side timeouts even when:
   * - Browser tab is in background (JavaScript throttled)
   * - Loro sync is delayed
   * - Server timeout hasn't fired yet
   *
   * Also handles visibility change to immediately check when page becomes visible,
   * ensuring expired requests are cleaned up as soon as user returns to the tab.
   */
  useEffect(() => {
    const triggerExpirationCheck = () => {
      setExpirationTick((prev) => prev + 1);
    };

    const expirationCheckInterval = setInterval(triggerExpirationCheck, INTERVALS.EXPIRATION_CHECK);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        triggerExpirationCheck();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(expirationCheckInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return { pendingRequests };
}
