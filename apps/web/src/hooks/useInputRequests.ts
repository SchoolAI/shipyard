/**
 * Hook to monitor INPUT_REQUESTS array and show toast notifications.
 * Detects new pending requests and dispatches events for modal trigger.
 *
 * Pattern based on:
 * - usePendingUserNotifications.ts (toast + observer)
 * - useInboxEvents.ts (event monitoring)
 */

import { type InputRequest, YDOC_KEYS } from '@shipyard/schema';
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
      const pending = filterPendingRequests(allRequests);

      // Find NEW requests (not in previous set)
      const newRequests = findNewRequests(pending, previousRequestIdsRef.current);

      // Update state
      setPendingRequests(pending);

      // Update tracking set
      const currentIds = createRequestIdSet(pending);
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

    // Cleanup: unobserve on unmount or ydoc change
    return () => {
      // Capture requestsArray in closure to ensure correct cleanup
      // even if ydoc changes during async state update
      requestsArray.unobserve(updateRequests);
      previousRequestIdsRef.current.clear(); // Clear on ydoc change
    };
  }, [ydoc]);

  return { pendingRequests };
}
