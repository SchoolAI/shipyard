import {
  InputRequestSchema,
  YDOC_KEYS,
  createInputRequest,
  logPlanEvent
} from "./chunk-ARFICLCB.js";
import {
  logger
} from "./chunk-64LGVSCH.js";

// src/services/input-request-manager.ts
var InputRequestManager = class {
  /**
   * Create a new input request in the Y.Doc.
   * Request is added to the INPUT_REQUESTS array and becomes visible in browser UI.
   *
   * @param ydoc - The Y.Doc to add the request to
   * @param params - Request parameters (message, type, options, etc.)
   * @returns The generated request ID
   */
  createRequest(ydoc, params) {
    const request = createInputRequest(params);
    ydoc.transact(() => {
      const requestsArray = ydoc.getArray(YDOC_KEYS.INPUT_REQUESTS);
      requestsArray.push([request]);
      logPlanEvent(ydoc, "input_request_created", "Agent", {
        requestId: request.id,
        requestType: request.type,
        requestMessage: request.message
      });
    });
    logger.info(
      { requestId: request.id, type: request.type, timeout: request.timeout },
      "Created input request in Y.Doc"
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
  async waitForResponse(ydoc, requestId, timeoutSeconds) {
    return new Promise((resolve) => {
      const requestsArray = ydoc.getArray(YDOC_KEYS.INPUT_REQUESTS);
      let resolved = false;
      let timeoutHandle;
      let observerFn;
      const findRequest = () => {
        const requests = requestsArray.toJSON();
        return requests.find((r) => r.id === requestId);
      };
      const cleanup = () => {
        if (observerFn) {
          requestsArray.unobserve(observerFn);
          observerFn = void 0;
        }
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
          timeoutHandle = void 0;
        }
        if (!resolved) {
          resolved = true;
        }
      };
      const checkStatus = () => {
        if (resolved) return;
        const request2 = findRequest();
        if (!request2) {
          handleRequestNotFound();
          return;
        }
        logger.debug({ requestId, status: request2.status }, "Checking input request status");
        if (request2.status === "answered") {
          handleAnsweredStatus(request2);
        } else if (request2.status === "declined") {
          handleDeclinedStatus();
        } else if (request2.status === "cancelled") {
          handleCancelledStatus();
        }
      };
      const handleRequestNotFound = () => {
        logger.warn({ requestId }, "Request not found, treating as cancelled");
        resolved = true;
        cleanup();
        resolve({
          success: false,
          status: "cancelled",
          reason: "Request not found in Y.Doc"
        });
      };
      const handleAnsweredStatus = (request2) => {
        logger.info({ requestId, answeredBy: request2.answeredBy }, "Input request answered");
        resolved = true;
        cleanup();
        resolve({
          success: true,
          response: request2.response,
          status: "answered",
          answeredBy: request2.answeredBy ?? "unknown",
          answeredAt: request2.answeredAt ?? Date.now()
        });
      };
      const handleDeclinedStatus = () => {
        logger.info({ requestId }, "Input request declined by user");
        resolved = true;
        cleanup();
        resolve({
          success: true,
          status: "declined",
          reason: "User declined to answer"
        });
      };
      const handleCancelledStatus = () => {
        logger.info({ requestId }, "Input request cancelled (timeout)");
        resolved = true;
        cleanup();
        resolve({
          success: false,
          status: "cancelled",
          reason: "Request timed out"
        });
      };
      observerFn = () => {
        checkStatus();
      };
      checkStatus();
      if (resolved) {
        return;
      }
      requestsArray.observe(observerFn);
      const request = findRequest();
      const effectiveTimeout = timeoutSeconds !== void 0 ? timeoutSeconds : request?.timeout !== void 0 ? request.timeout : 0;
      const handleTimeout = () => {
        if (resolved) return;
        logger.warn({ requestId, timeout: effectiveTimeout }, "Input request timed out");
        markRequestAsCancelled();
        if (resolved) return;
        resolved = true;
        cleanup();
        resolve({
          success: false,
          status: "cancelled",
          reason: `Timeout after ${effectiveTimeout} seconds`
        });
      };
      const markRequestAsCancelled = () => {
        ydoc.transact(() => {
          if (resolved) return;
          const currentRequest = findRequest();
          if (!currentRequest || currentRequest.status !== "pending") {
            return;
          }
          const requests = requestsArray.toJSON();
          const index = requests.findIndex((r) => r.id === requestId);
          if (index !== -1) {
            requestsArray.delete(index, 1);
            requestsArray.insert(index, [{ ...currentRequest, status: "cancelled" }]);
          }
        });
      };
      if (effectiveTimeout > 0) {
        timeoutHandle = setTimeout(handleTimeout, effectiveTimeout * 1e3);
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
  cancelRequest(ydoc, requestId) {
    let cancelled = false;
    ydoc.transact(() => {
      const requestsArray = ydoc.getArray(YDOC_KEYS.INPUT_REQUESTS);
      const requests = requestsArray.toJSON();
      const index = requests.findIndex((r) => r.id === requestId);
      if (index !== -1) {
        const request = requests[index];
        if (request.status === "pending") {
          requestsArray.delete(index, 1);
          requestsArray.insert(index, [{ ...request, status: "cancelled" }]);
          cancelled = true;
          logger.info({ requestId }, "Cancelled input request");
        } else {
          logger.debug({ requestId, status: request.status }, "Request not pending, cannot cancel");
        }
      } else {
        logger.warn({ requestId }, "Request not found for cancellation");
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
  getRequest(ydoc, requestId) {
    const requestsArray = ydoc.getArray(YDOC_KEYS.INPUT_REQUESTS);
    const requests = requestsArray.toJSON();
    const request = requests.find((r) => r.id === requestId);
    if (request) {
      const parseResult = InputRequestSchema.safeParse(request);
      if (parseResult.success) {
        return parseResult.data;
      }
      logger.warn({ requestId, error: parseResult.error }, "Invalid request data in Y.Doc");
    }
    return void 0;
  }
  /**
   * Get all pending input requests for a Y.Doc.
   * Useful for UI to display all active requests.
   *
   * @param ydoc - The Y.Doc to query
   * @returns Array of pending requests
   */
  getPendingRequests(ydoc) {
    const requestsArray = ydoc.getArray(YDOC_KEYS.INPUT_REQUESTS);
    const requests = requestsArray.toJSON();
    return requests.filter((r) => r.status === "pending");
  }
  /**
   * Clean up old completed/cancelled requests from Y.Doc.
   * Removes requests older than the specified age to prevent unbounded growth.
   *
   * @param ydoc - The Y.Doc to clean up
   * @param maxAgeMs - Maximum age in milliseconds (default: 24 hours)
   * @returns Number of requests removed
   */
  cleanupOldRequests(ydoc, maxAgeMs = 24 * 60 * 60 * 1e3) {
    let removed = 0;
    const cutoff = Date.now() - maxAgeMs;
    ydoc.transact(() => {
      const requestsArray = ydoc.getArray(YDOC_KEYS.INPUT_REQUESTS);
      const requests = requestsArray.toJSON();
      for (let i = requests.length - 1; i >= 0; i--) {
        const request = requests[i];
        if (request.status !== "pending" && (request.answeredAt ?? request.createdAt) < cutoff) {
          requestsArray.delete(i, 1);
          removed++;
        }
      }
    });
    if (removed > 0) {
      logger.info({ removed, maxAgeMs }, "Cleaned up old input requests");
    }
    return removed;
  }
};

export {
  InputRequestManager
};
