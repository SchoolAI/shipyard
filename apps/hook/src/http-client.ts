/**
 * HTTP client for communicating with the peer-plan registry server.
 * Uses tRPC for type-safe RPC calls.
 */

import type {
  CreateHookSessionRequest,
  CreateHookSessionResponse,
  GetReviewStatusResponse,
  UpdatePlanContentRequest,
  UpdatePlanContentResponse,
  UpdatePresenceRequest,
  UpdatePresenceResponse,
} from '@peer-plan/schema';
import { registryConfig } from './config/env/registry.js';
import { logger } from './logger.js';
import { getTRPCClient } from './trpc-client.js';

/**
 * Retries an async operation with exponential backoff.
 * @param fn - Async function to retry
 * @param maxAttempts - Maximum retry attempts (default: 3)
 * @param baseDelay - Base delay in ms (default: 1000)
 * @returns Result of fn or throws last error
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  baseDelay = 1000
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err as Error;
      if (attempt < maxAttempts - 1) {
        const delay = attempt === 0 ? 0 : baseDelay * 2 ** (attempt - 1);
        logger.debug(
          { attempt: attempt + 1, maxAttempts, delay },
          'Registry health check failed, retrying...'
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error('Retry failed');
}

/**
 * Discovers the registry server URL by checking health endpoints with retry logic.
 * Returns null if no server found after all retries.
 */
async function getRegistryUrl(): Promise<string | null> {
  const ports = registryConfig.REGISTRY_PORT;

  for (const port of ports) {
    try {
      const url = `http://localhost:${port}`;

      // Retry health check with exponential backoff
      await retryWithBackoff(
        async () => {
          const res = await fetch(`${url}/registry`, {
            signal: AbortSignal.timeout(5000), // Increased from 3s to 5s
          });
          if (!res.ok) {
            throw new Error(`Registry responded with status ${res.status}`);
          }
        },
        3, // 3 attempts total
        1000 // Start with 1s delay
      );

      logger.debug({ port }, 'Found registry server (with retry)');
      return url;
    } catch (err) {
      const error = err as Error;
      logger.debug(
        { port, error: error.message },
        'Failed to connect to registry port after retries'
      );
    }
  }

  // Add diagnostic logging before returning null
  logger.error(
    {
      ports,
      attemptsPerPort: 3,
      totalTimeout: '15s (5s per attempt * 3 attempts)',
    },
    'Registry server not reachable - check if `pnpm dev` is running'
  );

  return null;
}

// --- API Methods ---

/**
 * Get WebSocket URL for Y.Doc sync.
 * Uses direct port scanning - the hub's WebSocket server runs on the same port as HTTP.
 */
export async function getWebSocketUrl(): Promise<string | null> {
  const baseUrl = await getRegistryUrl();
  if (!baseUrl) {
    logger.warn('getWebSocketUrl: No server available');
    return null;
  }

  // The hub's WebSocket server runs on the same port as HTTP
  // Just convert http:// to ws://
  const wsUrl = baseUrl.replace('http://', 'ws://');
  logger.debug({ wsUrl }, 'Constructed WebSocket URL from hub');
  return wsUrl;
}

/**
 * Create a new plan session.
 */
export async function createSession(
  request: CreateHookSessionRequest
): Promise<CreateHookSessionResponse> {
  const baseUrl = await getRegistryUrl();
  if (!baseUrl) {
    throw new Error('Registry server not available');
  }

  const trpc = getTRPCClient(baseUrl);
  return trpc.hook.createSession.mutate(request);
}

/**
 * Update plan content.
 */
export async function updatePlanContent(
  planId: string,
  request: UpdatePlanContentRequest
): Promise<UpdatePlanContentResponse> {
  const baseUrl = await getRegistryUrl();
  if (!baseUrl) {
    throw new Error('Registry server not available');
  }

  const trpc = getTRPCClient(baseUrl);
  return trpc.hook.updateContent.mutate({ planId, ...request });
}

/**
 * Get review status for a plan.
 */
export async function getReviewStatus(planId: string): Promise<GetReviewStatusResponse> {
  const baseUrl = await getRegistryUrl();
  if (!baseUrl) {
    throw new Error('Registry server not available');
  }

  const trpc = getTRPCClient(baseUrl);
  return trpc.hook.getReviewStatus.query({ planId });
}

/**
 * Update agent presence (heartbeat).
 */
export async function updatePresence(
  planId: string,
  request: UpdatePresenceRequest
): Promise<UpdatePresenceResponse> {
  const baseUrl = await getRegistryUrl();
  if (!baseUrl) {
    throw new Error('Registry server not available');
  }

  const trpc = getTRPCClient(baseUrl);
  return trpc.hook.updatePresence.mutate({ planId, ...request });
}

/**
 * Set session token hash on a plan (called on approval).
 * Returns the URL for the plan.
 */
export async function setSessionToken(
  planId: string,
  sessionTokenHash: string
): Promise<{ url: string }> {
  const baseUrl = await getRegistryUrl();
  if (!baseUrl) {
    throw new Error('Registry server not available');
  }

  const trpc = getTRPCClient(baseUrl);
  return trpc.hook.setSessionToken.mutate({ planId, sessionTokenHash });
}

/**
 * Wait for approval decision (blocking call to server).
 * Server observes Y.Doc and returns when status changes to approved or rejected.
 */
export async function waitForApproval(
  planId: string,
  reviewRequestId: string
): Promise<{
  approved: boolean;
  feedback?: string;
  deliverables?: unknown[];
  reviewComment?: string;
  reviewedBy?: string;
  status?: string;
}> {
  const baseUrl = await getRegistryUrl();
  if (!baseUrl) {
    throw new Error('Registry server not available');
  }

  const trpc = getTRPCClient(baseUrl);
  return trpc.hook.waitForApproval.mutate({ planId, reviewRequestId });
}
