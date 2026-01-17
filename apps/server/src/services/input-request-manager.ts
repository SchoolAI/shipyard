/**
 * Service for managing user input requests via Y.Doc.
 * Provides blocking API that waits for user responses in the browser UI.
 *
 * Pattern based on apps/hook/src/core/review-status.ts:waitForReviewDecision()
 * Uses Y.Doc observer to detect when user responds to a request.
 */

import {
  type CreateInputRequestParams,
  createInputRequest,
  type InputRequest,
  InputRequestSchema,
  YDOC_KEYS,
} from '@peer-plan/schema';
import type * as Y from 'yjs';
import { logger } from '../logger.js';

/**
 * Response from waiting for a user input request.
 * Includes the response value and metadata about who answered.
 */
export interface InputRequestResponse {
  /** Whether a valid response was received */
  success: boolean;
  /** The user's response (undefined if cancelled/timeout) */
  response?: unknown;
  /** Status when response was returned */
  status: 'answered' | 'cancelled';
  /** Who answered the request (if answered) */
  answeredBy?: string;
  /** When the request was answered (if answered) */
  answeredAt?: number;
  /** Cancellation reason (if cancelled) */
  reason?: string;
}

/**
 * Manager for user input requests stored in Y.Doc.
 * Handles creating requests, waiting for responses, and cleanup.
 */
export class InputRequestManager {
  /**
   * Create a new input request in the Y.Doc.
   * Request is added to the INPUT_REQUESTS array and becomes visible in browser UI.
   *
   * @param ydoc - The Y.Doc to add the request to
   * @param params - Request parameters (message, type, options, etc.)
   * @returns The generated request ID
   */
  createRequest(ydoc: Y.Doc, params: CreateInputRequestParams): string {
    const request = createInputRequest(params);

    // Add request to Y.Doc in a transaction
    ydoc.transact(() => {
      const requestsArray = ydoc.getArray<InputRequest>(YDOC_KEYS.INPUT_REQUESTS);
      requestsArray.push([request]);
    });

    logger.info(
      { requestId: request.id, type: request.type, timeout: request.timeout },
      'Created input request in Y.Doc'
    );

    return request.id;
  }

  /**
   * Wait for a user to respond to an input request.
   * Blocks until the request is answered, cancelled, or times out.
   *
   * Pattern: Based on waitForReviewDecision from review-status.ts
   * - Observes Y.Doc changes via Y.Array observer
   * - Polls for status changes to the specific request
   * - Unsubscribes and cleans up on completion
   *
   * @param ydoc - The Y.Doc containing the request
   * @param requestId - The ID of the request to wait for
   * @param timeoutSeconds - Max time to wait (0 = no timeout, uses request.timeout if not specified)
   * @returns Promise that resolves when request is answered/cancelled
   */
  async waitForResponse(
    ydoc: Y.Doc,
    requestId: string,
    timeoutSeconds?: number
  ): Promise<InputRequestResponse> {
    return new Promise((resolve) => {
      const requestsArray = ydoc.getArray<InputRequest>(YDOC_KEYS.INPUT_REQUESTS);
      let resolved = false;
      let timeoutHandle: NodeJS.Timeout | undefined;

      // Find the request in the array
      const findRequest = (): InputRequest | undefined => {
        const requests = requestsArray.toJSON();
        return requests.find((r) => r.id === requestId);
      };

      const cleanup = () => {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
          timeoutHandle = undefined;
        }
        if (!resolved) {
          resolved = true;
        }
      };

      const checkStatus = () => {
        if (resolved) return;

        const request = findRequest();
        if (!request) {
          logger.warn({ requestId }, 'Request not found, treating as cancelled');
          cleanup();
          resolve({
            success: false,
            status: 'cancelled',
            reason: 'Request not found in Y.Doc',
          });
          return;
        }

        logger.debug({ requestId, status: request.status }, 'Checking input request status');

        if (request.status === 'answered') {
          logger.info({ requestId, answeredBy: request.answeredBy }, 'Input request answered');
          cleanup();
          resolve({
            success: true,
            response: request.response,
            status: 'answered',
            answeredBy: request.answeredBy,
            answeredAt: request.answeredAt,
          });
        } else if (request.status === 'cancelled') {
          logger.info({ requestId }, 'Input request cancelled');
          cleanup();
          resolve({
            success: false,
            status: 'cancelled',
            reason: 'Request was cancelled',
          });
        }
      };

      // Observe changes to the requests array
      const observer = () => {
        checkStatus();
      };

      // Check status immediately in case request was already answered
      checkStatus();

      // If already resolved after immediate check, don't set up observer
      if (resolved) {
        return;
      }

      // Set up observer for future changes
      requestsArray.observe(observer);

      // Determine timeout value
      const request = findRequest();
      const effectiveTimeout =
        timeoutSeconds !== undefined
          ? timeoutSeconds
          : request?.timeout !== undefined
            ? request.timeout
            : 0;

      // Set up timeout if specified (0 = no timeout)
      if (effectiveTimeout > 0) {
        timeoutHandle = setTimeout(() => {
          if (!resolved) {
            logger.warn({ requestId, timeout: effectiveTimeout }, 'Input request timed out');

            // Mark request as cancelled in Y.Doc
            ydoc.transact(() => {
              const currentRequest = findRequest();
              if (currentRequest && currentRequest.status === 'pending') {
                // Update the request in place
                const requests = requestsArray.toJSON();
                const index = requests.findIndex((r) => r.id === requestId);
                if (index !== -1) {
                  requestsArray.delete(index, 1);
                  requestsArray.insert(index, [{ ...currentRequest, status: 'cancelled' }]);
                }
              }
            });

            cleanup();
            requestsArray.unobserve(observer);
            resolve({
              success: false,
              status: 'cancelled',
              reason: `Timeout after ${effectiveTimeout} seconds`,
            });
          }
        }, effectiveTimeout * 1000);
      }
    });
  }

  /**
   * Cancel a pending input request.
   * Marks the request as cancelled in the Y.Doc.
   *
   * @param ydoc - The Y.Doc containing the request
   * @param requestId - The ID of the request to cancel
   * @returns True if request was found and cancelled, false otherwise
   */
  cancelRequest(ydoc: Y.Doc, requestId: string): boolean {
    let cancelled = false;

    ydoc.transact(() => {
      const requestsArray = ydoc.getArray<InputRequest>(YDOC_KEYS.INPUT_REQUESTS);
      const requests = requestsArray.toJSON();
      const index = requests.findIndex((r) => r.id === requestId);

      if (index !== -1) {
        const request = requests[index];
        if (request.status === 'pending') {
          requestsArray.delete(index, 1);
          requestsArray.insert(index, [{ ...request, status: 'cancelled' }]);
          cancelled = true;
          logger.info({ requestId }, 'Cancelled input request');
        } else {
          logger.debug({ requestId, status: request.status }, 'Request not pending, cannot cancel');
        }
      } else {
        logger.warn({ requestId }, 'Request not found for cancellation');
      }
    });

    return cancelled;
  }

  /**
   * Get the current state of an input request.
   * Returns undefined if the request doesn't exist.
   *
   * @param ydoc - The Y.Doc containing the request
   * @param requestId - The ID of the request to retrieve
   * @returns The request object, or undefined if not found
   */
  getRequest(ydoc: Y.Doc, requestId: string): InputRequest | undefined {
    const requestsArray = ydoc.getArray<InputRequest>(YDOC_KEYS.INPUT_REQUESTS);
    const requests = requestsArray.toJSON();
    const request = requests.find((r) => r.id === requestId);

    if (request) {
      // Validate with Zod schema before returning
      const parseResult = InputRequestSchema.safeParse(request);
      if (parseResult.success) {
        return parseResult.data;
      }
      logger.warn({ requestId, error: parseResult.error }, 'Invalid request data in Y.Doc');
    }

    return undefined;
  }

  /**
   * Get all pending input requests for a Y.Doc.
   * Useful for UI to display all active requests.
   *
   * @param ydoc - The Y.Doc to query
   * @returns Array of pending requests
   */
  getPendingRequests(ydoc: Y.Doc): InputRequest[] {
    const requestsArray = ydoc.getArray<InputRequest>(YDOC_KEYS.INPUT_REQUESTS);
    const requests = requestsArray.toJSON();
    return requests.filter((r) => r.status === 'pending');
  }

  /**
   * Clean up old completed/cancelled requests from Y.Doc.
   * Removes requests older than the specified age to prevent unbounded growth.
   *
   * @param ydoc - The Y.Doc to clean up
   * @param maxAgeMs - Maximum age in milliseconds (default: 24 hours)
   * @returns Number of requests removed
   */
  cleanupOldRequests(ydoc: Y.Doc, maxAgeMs = 24 * 60 * 60 * 1000): number {
    let removed = 0;
    const cutoff = Date.now() - maxAgeMs;

    ydoc.transact(() => {
      const requestsArray = ydoc.getArray<InputRequest>(YDOC_KEYS.INPUT_REQUESTS);
      const requests = requestsArray.toJSON();

      // Remove in reverse order to maintain indices
      for (let i = requests.length - 1; i >= 0; i--) {
        const request = requests[i];
        if (request.status !== 'pending' && (request.answeredAt ?? request.createdAt) < cutoff) {
          requestsArray.delete(i, 1);
          removed++;
        }
      }
    });

    if (removed > 0) {
      logger.info({ removed, maxAgeMs }, 'Cleaned up old input requests');
    }

    return removed;
  }
}
