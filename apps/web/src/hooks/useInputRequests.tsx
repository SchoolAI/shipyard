/**
 * Hook to monitor INPUT_REQUESTS array and show toast notifications.
 * Detects new pending requests and dispatches events for modal trigger.
 *
 * Pattern based on:
 * - usePendingUserNotifications.ts (toast + observer)
 * - useInboxEvents.ts (event monitoring)
 */

import {
  type AnyInputRequest,
  AnyInputRequestSchema,
  DEFAULT_INPUT_REQUEST_TIMEOUT_SECONDS,
  YDOC_KEYS,
} from '@shipyard/schema';
import { AlertOctagon } from 'lucide-react';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import type * as Y from 'yjs';
import { MarkdownContent } from '@/components/ui/MarkdownContent';

export interface UseInputRequestsOptions {
  /** The Y.Doc to monitor for input requests */
  ydoc: Y.Doc | null;
  /** Callback fired when a new request is received */
  onRequestReceived?: (request: AnyInputRequest) => void;
}

export interface UseInputRequestsReturn {
  /** Array of currently pending requests */
  pendingRequests: AnyInputRequest[];
}

/**
 * Filters array of input requests to only include pending ones.
 */
function filterPendingRequests(requests: AnyInputRequest[]): AnyInputRequest[] {
  return requests.filter((r) => r.status === 'pending');
}

/**
 * Identifies which requests are new (not in the previous set).
 */
function findNewRequests(
  pendingRequests: AnyInputRequest[],
  previousRequestIds: Set<string>
): AnyInputRequest[] {
  return pendingRequests.filter((req) => !previousRequestIds.has(req.id));
}

/**
 * Creates a set of request IDs from an array of requests.
 */
function createRequestIdSet(requests: AnyInputRequest[]): Set<string> {
  return new Set(requests.map((r) => r.id));
}

/**
 * Finds request IDs that were in the previous set but are no longer pending.
 * Used to dismiss toasts for resolved requests.
 */
function findResolvedRequestIds(previousIds: Set<string>, currentIds: Set<string>): string[] {
  return Array.from(previousIds).filter((id) => !currentIds.has(id));
}

/**
 * Dismisses toasts for requests that are no longer pending.
 * Handles both individual toasts and grouped toasts.
 *
 * Toast strategy:
 * - 0 requests: No toasts shown
 * - 1 request: Individual toast with ID `input-request-${id}`
 * - 2+ requests: Grouped toast with ID `input-requests-grouped`
 *
 * When requests are resolved, we need to:
 * 1. Dismiss the grouped toast (in case we went from N to M requests)
 * 2. Dismiss individual toasts for resolved requests
 */
function dismissResolvedToasts(resolvedIds: string[]): void {
  /** Dismiss individual request toasts */
  for (const id of resolvedIds) {
    toast.dismiss(`input-request-${id}`);
  }

  /**
   * Always dismiss the grouped toast when requests change.
   * This handles transitions like:
   * - 3 -> 2 requests (grouped toast needs refresh with new count)
   * - 2 -> 1 request (grouped toast should be replaced by individual)
   * - N -> 0 requests (grouped toast should be dismissed)
   *
   * The grouped toast will be re-shown with the correct count if needed
   * by showInputRequestToast when new requests come in.
   */
  toast.dismiss('input-requests-grouped');
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

/** Blocker icon element used in toast notifications */
const blockerIcon = <AlertOctagon className="w-5 h-5 text-danger" />;

/**
 * Toast description component that includes message and optional "View Plan" link.
 * Opens plan in same tab when clicked.
 */
function ToastDescription({
  message,
  planId,
}: {
  message: string;
  planId?: string;
}): React.ReactElement {
  const handleViewPlan = (e: React.MouseEvent) => {
    e.preventDefault();
    if (planId) {
      window.location.href = `/task/${planId}`;
    }
  };

  return (
    <div className="space-y-1">
      <MarkdownContent content={message} variant="toast" className="line-clamp-2" />
      {planId && (
        <button
          type="button"
          onClick={handleViewPlan}
          className="text-xs text-accent hover:underline flex items-center gap-1"
        >
          View Plan →
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
    duration: 60000,
    description,
    icon: hasBlocker ? blockerIcon : undefined,
    action: { label: 'Respond', onClick },
  });
}

/**
 * Show a toast for a single input request.
 * Includes "View Plan" link when planId is available.
 */
function showSingleRequestToast(request: AnyInputRequest, onClick: () => void): void {
  const isBlocker = request.isBlocker;
  const toastFn = isBlocker ? toast.error : toast.info;
  const title = isBlocker ? 'BLOCKER: Agent needs your input' : 'Agent needs your input';

  toastFn(title, {
    id: `input-request-${request.id}`,
    position: 'top-right',
    duration: 60000,
    description: (
      <ToastDescription message={getRequestDisplayMessage(request)} planId={request.planId} />
    ),
    icon: isBlocker ? blockerIcon : undefined,
    action: { label: 'Respond', onClick },
  });
}

/**
 * Shows a toast notification for new input request(s).
 * Groups multiple pending requests into a single toast.
 * Blockers get urgent red styling with AlertOctagon icon.
 */
function showInputRequestToast(
  newRequests: AnyInputRequest[],
  totalPending: number,
  onOpenModal: () => void,
  onOpenSpecificRequest: (request: AnyInputRequest) => void
): void {
  if (newRequests.length === 0) return;

  if (totalPending > 1) {
    const hasBlocker = newRequests.some((r) => r.isBlocker);
    showGroupedToast(totalPending, hasBlocker, onOpenModal);
  } else {
    const request = newRequests[0];
    if (request) {
      showSingleRequestToast(request, () => onOpenSpecificRequest(request));
    }
  }
}

/**
 * Dispatches a custom event to open the input request modal.
 */
function dispatchOpenInputRequestEvent(request: AnyInputRequest): void {
  document.dispatchEvent(
    new CustomEvent('open-input-request', {
      detail: request,
    })
  );
}

/**
 * Check if a request has expired based on its createdAt and timeout.
 */
function isRequestExpired(request: AnyInputRequest): boolean {
  const timeoutMs = (request.timeout || DEFAULT_INPUT_REQUEST_TIMEOUT_SECONDS) * 1000;
  const elapsed = Date.now() - request.createdAt;
  return elapsed >= timeoutMs;
}

/**
 * Filter out expired requests from the array.
 * This provides client-side expiration detection even when Y.Doc sync is delayed.
 */
function filterOutExpiredRequests(requests: AnyInputRequest[]): AnyInputRequest[] {
  return requests.filter((r) => !isRequestExpired(r));
}

/**
 * Shows or updates the toast for remaining pending requests after some have been resolved.
 * - Multiple pending: Shows grouped toast with updated count
 * - Single pending: Shows individual toast for that request
 * - None pending: All toasts already dismissed, nothing to show
 * Blockers get urgent red styling with AlertOctagon icon.
 */
function showRemainingRequestsToast(pending: AnyInputRequest[]): void {
  if (pending.length > 1) {
    const firstRequest = pending[0];
    const hasBlocker = pending.some((r) => r.isBlocker);
    showGroupedToast(pending.length, hasBlocker, () => {
      if (firstRequest) dispatchOpenInputRequestEvent(firstRequest);
    });
  } else if (pending.length === 1) {
    const request = pending[0];
    if (request) {
      showSingleRequestToast(request, () => dispatchOpenInputRequestEvent(request));
    }
  }
}

/**
 * Parse raw requests from Y.Array and filter to only valid, pending, non-expired requests.
 */
function parseAndFilterRequests(rawRequests: unknown[]): AnyInputRequest[] {
  const allRequests = rawRequests
    .map((item) => AnyInputRequestSchema.safeParse(item))
    .filter((result) => result.success)
    .map((result) => result.data);

  const pendingByStatus = filterPendingRequests(allRequests);
  return filterOutExpiredRequests(pendingByStatus);
}

/**
 * Handle resolved requests by dismissing their toasts and updating the remaining toast.
 */
function handleResolvedRequests(resolvedIds: string[], pending: AnyInputRequest[]): void {
  if (resolvedIds.length === 0) return;

  dismissResolvedToasts(resolvedIds);
  showRemainingRequestsToast(pending);
}

/**
 * Handle new requests by showing toast notifications and notifying callbacks.
 */
function handleNewRequests(
  newRequests: AnyInputRequest[],
  pending: AnyInputRequest[],
  onRequestReceived: ((request: AnyInputRequest) => void) | undefined
): void {
  if (newRequests.length === 0) return;

  const firstRequest = pending[0];

  showInputRequestToast(
    newRequests,
    pending.length,
    () => {
      if (firstRequest) {
        dispatchOpenInputRequestEvent(firstRequest);
      }
    },
    (request) => {
      dispatchOpenInputRequestEvent(request);
    }
  );

  /** Notify parent via callback */
  for (const request of newRequests) {
    onRequestReceived?.(request);
  }
}

/**
 * Hook that monitors the INPUT_REQUESTS array in Y.Doc and shows toast notifications
 * when new pending requests are detected.
 *
 * Features:
 * - Observes Y.Doc INPUT_REQUESTS array
 * - Filters for status='pending'
 * - Detects NEW requests (not in previous list)
 * - Shows toast notification (top-right, 60s duration)
 * - Grouped toast if multiple pending
 * - Dispatches custom event 'open-input-request' for modal trigger
 * - Calls onRequestReceived callback for parent
 *
 * @param options - Configuration options
 * @returns Object containing pendingRequests array
 */
export function useInputRequests({
  ydoc,
  onRequestReceived,
}: UseInputRequestsOptions): UseInputRequestsReturn {
  const [pendingRequests, setPendingRequests] = useState<AnyInputRequest[]>([]);

  /** Track previously seen requests to detect new ones */
  const previousRequestIdsRef = useRef<Set<string>>(new Set());

  /** Stable ref for callback to avoid including it in deps */
  const onRequestReceivedRef = useRef(onRequestReceived);

  /** Update ref when callback changes */
  useEffect(() => {
    onRequestReceivedRef.current = onRequestReceived;
  }, [onRequestReceived]);

  useEffect(() => {
    if (!ydoc) {
      /** Reset state when ydoc is null */
      setPendingRequests([]);
      previousRequestIdsRef.current.clear();
      return;
    }

    const requestsArray = ydoc.getArray<AnyInputRequest>(YDOC_KEYS.INPUT_REQUESTS);

    const updateRequests = () => {
      /** Get and filter requests to only valid, pending, non-expired ones */
      const rawRequests = requestsArray.toJSON();
      const pending = parseAndFilterRequests(rawRequests);

      /** Create set of current pending IDs */
      const currentIds = createRequestIdSet(pending);

      /** Find NEW requests (not in previous set) */
      const newRequests = findNewRequests(pending, previousRequestIdsRef.current);

      /** Find RESOLVED requests (were pending before, not anymore) */
      const resolvedIds = findResolvedRequestIds(previousRequestIdsRef.current, currentIds);

      /** Handle resolved requests (dismiss toasts, show remaining) */
      handleResolvedRequests(resolvedIds, pending);

      /** Update state */
      setPendingRequests(pending);

      /** Update tracking set */
      previousRequestIdsRef.current = currentIds;

      /** Handle new requests (show toasts, notify callbacks) */
      handleNewRequests(newRequests, pending, onRequestReceivedRef.current);
    };

    /** Initial check for requests */
    updateRequests();

    /** Set up observer for array changes */
    requestsArray.observe(updateRequests);

    /*
     * Set up periodic check for expired requests (every 5 seconds)
     * This ensures we detect client-side timeouts even when:
     * - Browser tab is in background (JavaScript throttled)
     * - Y.Doc sync is delayed
     * - Server timeout hasn't fired yet
     */
    const expirationCheckInterval = setInterval(updateRequests, 5000);

    /*
     * Set up visibility change listener to immediately check when page becomes visible
     * This ensures expired requests are cleaned up as soon as user returns to the tab
     */
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        updateRequests();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    /** Cleanup: unobserve on unmount or ydoc change */
    return () => {
      /*
       * Capture requestsArray in closure to ensure correct cleanup
       * even if ydoc changes during async state update
       */
      requestsArray.unobserve(updateRequests);
      clearInterval(expirationCheckInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      previousRequestIdsRef.current.clear();
    };
  }, [ydoc]);

  return { pendingRequests };
}
