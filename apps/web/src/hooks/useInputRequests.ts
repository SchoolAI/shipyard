/**
 * Hook to monitor INPUT_REQUESTS array and show toast notifications.
 * Detects new pending requests and dispatches events for modal trigger.
 *
 * Pattern based on:
 * - usePendingUserNotifications.ts (toast + observer)
 * - useInboxEvents.ts (event monitoring)
 */

import {
  DEFAULT_INPUT_REQUEST_TIMEOUT_SECONDS,
  type InputRequest,
  YDOC_KEYS,
} from '@shipyard/schema';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import type * as Y from 'yjs';

export interface UseInputRequestsOptions {
  /** The Y.Doc to monitor for input requests */
  ydoc: Y.Doc | null;
  /** Callback fired when a new request is received */
  onRequestReceived?: (request: InputRequest) => void;
}

export interface UseInputRequestsReturn {
  /** Array of currently pending requests */
  pendingRequests: InputRequest[];
}

/**
 * Filters array of input requests to only include pending ones.
 */
function filterPendingRequests(requests: InputRequest[]): InputRequest[] {
  return requests.filter((r) => r.status === 'pending');
}

/**
 * Identifies which requests are new (not in the previous set).
 */
function findNewRequests(
  pendingRequests: InputRequest[],
  previousRequestIds: Set<string>
): InputRequest[] {
  return pendingRequests.filter((req) => !previousRequestIds.has(req.id));
}

/**
 * Creates a set of request IDs from an array of requests.
 */
function createRequestIdSet(requests: InputRequest[]): Set<string> {
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
 * Also dismisses the grouped toast if no requests remain.
 */
function dismissResolvedToasts(resolvedIds: string[], remainingCount: number): void {
  // Dismiss individual request toasts
  for (const id of resolvedIds) {
    toast.dismiss(`input-request-${id}`);
  }

  // If no pending requests remain, also dismiss the grouped toast
  if (remainingCount === 0) {
    toast.dismiss('input-requests-grouped');
  }
}

/**
 * Shows a toast notification for new input request(s).
 * Groups multiple pending requests into a single toast.
 */
function showInputRequestToast(
  newRequests: InputRequest[],
  totalPending: number,
  onOpenModal: () => void
): void {
  if (newRequests.length === 0) return;

  // If multiple requests pending, show grouped toast
  if (totalPending > 1) {
    toast.info(`Agent needs input (${totalPending} pending)`, {
      id: 'input-requests-grouped',
      position: 'top-right',
      duration: 60000, // 60 seconds
      description: 'Multiple requests waiting for response',
      action: {
        label: 'Respond',
        onClick: onOpenModal,
      },
    });
  } else {
    // Show single request toast with message
    const request = newRequests[0];
    if (!request) return;

    toast.info('Agent needs your input', {
      id: `input-request-${request.id}`,
      position: 'top-right',
      duration: 60000, // 60 seconds
      description: request.message,
      action: {
        label: 'Respond',
        onClick: onOpenModal,
      },
    });
  }
}

/**
 * Dispatches a custom event to open the input request modal.
 */
function dispatchOpenInputRequestEvent(request: InputRequest): void {
  document.dispatchEvent(
    new CustomEvent('open-input-request', {
      detail: request,
    })
  );
}

/**
 * Check if a request has expired based on its createdAt and timeout.
 */
function isRequestExpired(request: InputRequest): boolean {
  const timeoutMs = (request.timeout || DEFAULT_INPUT_REQUEST_TIMEOUT_SECONDS) * 1000;
  const elapsed = Date.now() - request.createdAt;
  return elapsed >= timeoutMs;
}

/**
 * Filter out expired requests from the array.
 * This provides client-side expiration detection even when Y.Doc sync is delayed.
 */
function filterOutExpiredRequests(requests: InputRequest[]): InputRequest[] {
  return requests.filter((r) => !isRequestExpired(r));
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
  const [pendingRequests, setPendingRequests] = useState<InputRequest[]>([]);

  // Track previously seen requests to detect new ones
  const previousRequestIdsRef = useRef<Set<string>>(new Set());

  // Stable ref for callback to avoid including it in deps
  const onRequestReceivedRef = useRef(onRequestReceived);

  // Update ref when callback changes
  useEffect(() => {
    onRequestReceivedRef.current = onRequestReceived;
  }, [onRequestReceived]);

  useEffect(() => {
    if (!ydoc) {
      // Reset state when ydoc is null
      setPendingRequests([]);
      previousRequestIdsRef.current.clear();
      return;
    }

    const requestsArray = ydoc.getArray<InputRequest>(YDOC_KEYS.INPUT_REQUESTS);

    const updateRequests = () => {
      // Get all requests and filter for pending
      const allRequests = requestsArray.toJSON() as InputRequest[];
      // Filter for pending status first, then filter out client-side expired requests
      // Client-side expiration check ensures we detect timeouts even when Y.Doc sync is delayed
      // (e.g., browser tab in background, network latency, etc.)
      const pendingByStatus = filterPendingRequests(allRequests);
      const pending = filterOutExpiredRequests(pendingByStatus);

      // Create set of current pending IDs
      const currentIds = createRequestIdSet(pending);

      // Find NEW requests (not in previous set)
      const newRequests = findNewRequests(pending, previousRequestIdsRef.current);

      // Find RESOLVED requests (were pending before, not anymore)
      // This happens when another device responds to the request OR when client-side expiration fires
      const resolvedIds = findResolvedRequestIds(previousRequestIdsRef.current, currentIds);

      // Dismiss toasts for resolved requests
      if (resolvedIds.length > 0) {
        dismissResolvedToasts(resolvedIds, pending.length);
      }

      // Update state
      setPendingRequests(pending);

      // Update tracking set
      previousRequestIdsRef.current = currentIds;

      // Handle new requests
      if (newRequests.length > 0) {
        const firstRequest = pending[0];

        // Show toast notification (clicking toast will dispatch event to open modal)
        showInputRequestToast(newRequests, pending.length, () => {
          if (firstRequest) {
            dispatchOpenInputRequestEvent(firstRequest);
          }
        });

        // Notify parent via callback using stable ref
        for (const request of newRequests) {
          onRequestReceivedRef.current?.(request);
        }
      }
    };

    // Initial check for requests
    updateRequests();

    // Set up observer for array changes
    requestsArray.observe(updateRequests);

    // Set up periodic check for expired requests (every 5 seconds)
    // This ensures we detect client-side timeouts even when:
    // - Browser tab is in background (JavaScript throttled)
    // - Y.Doc sync is delayed
    // - Server timeout hasn't fired yet
    const expirationCheckInterval = setInterval(updateRequests, 5000);

    // Set up visibility change listener to immediately check when page becomes visible
    // This ensures expired requests are cleaned up as soon as user returns to the tab
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        updateRequests();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Cleanup: unobserve on unmount or ydoc change
    return () => {
      // Capture requestsArray in closure to ensure correct cleanup
      // even if ydoc changes during async state update
      requestsArray.unobserve(updateRequests);
      clearInterval(expirationCheckInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      previousRequestIdsRef.current.clear(); // Clear on ydoc change
    };
  }, [ydoc]);

  return { pendingRequests };
}
