/**
 * HTTP client for communicating with the shipyard registry server.
 * Uses tRPC for type-safe RPC calls.
 */

import type {
  CreateHookSessionRequest,
  CreateHookSessionResponse,
  Deliverable,
  GetReviewStatusResponse,
  SessionContextResult,
  UpdatePlanContentRequest,
  UpdatePlanContentResponse,
  UpdatePresenceRequest,
  UpdatePresenceResponse,
} from '@shipyard/schema';
import { APPROVAL_LONG_POLL_TIMEOUT_MS } from '@shipyard/shared';
import { registryConfig } from './config/env/registry.js';
import { logger } from './logger.js';
import { getTRPCClient } from './trpc-client.js';

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
      lastError = err instanceof Error ? err : new Error(String(err));
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

async function getRegistryUrl(): Promise<string | null> {
  const ports = registryConfig.REGISTRY_PORT;

  for (const port of ports) {
    try {
      const url = `http://localhost:${port}`;

      await retryWithBackoff(
        async () => {
          const res = await fetch(`${url}/registry`, {
            signal: AbortSignal.timeout(5000),
          });
          if (!res.ok) {
            throw new Error(`Registry responded with status ${res.status}`);
          }
        },
        3,
        1000
      );

      logger.debug({ port }, 'Found registry server (with retry)');
      return url;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.debug(
        { port, error: errorMessage },
        'Failed to connect to registry port after retries'
      );
    }
  }

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

export async function getWebSocketUrl(): Promise<string | null> {
  const baseUrl = await getRegistryUrl();
  if (!baseUrl) {
    logger.warn('getWebSocketUrl: No server available');
    return null;
  }

  const wsUrl = baseUrl.replace('http://', 'ws://');
  logger.debug({ wsUrl }, 'Constructed WebSocket URL from hub');
  return wsUrl;
}

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

export async function getReviewStatus(planId: string): Promise<GetReviewStatusResponse> {
  const baseUrl = await getRegistryUrl();
  if (!baseUrl) {
    throw new Error('Registry server not available');
  }

  const trpc = getTRPCClient(baseUrl);
  return trpc.hook.getReviewStatus.query({ planId });
}

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

export async function waitForApproval(
  planId: string,
  reviewRequestId: string
): Promise<{
  approved: boolean;
  feedback?: string;
  deliverables?: Deliverable[];
  reviewComment?: string;
  reviewedBy?: string;
  status?: string;
}> {
  const baseUrl = await getRegistryUrl();
  if (!baseUrl) {
    throw new Error('Registry server not available');
  }

  const trpc = getTRPCClient(baseUrl, APPROVAL_LONG_POLL_TIMEOUT_MS);
  return trpc.hook.waitForApproval.mutate({ planId, reviewRequestId });
}

export async function getSessionContext(sessionId: string): Promise<SessionContextResult> {
  const baseUrl = await getRegistryUrl();
  if (!baseUrl) {
    throw new Error('Registry server not available');
  }

  const trpc = getTRPCClient(baseUrl);
  return trpc.hook.getSessionContext.query({ sessionId });
}

export async function getDeliverableContext(
  planId: string,
  sessionToken: string
): Promise<{ context: string }> {
  const baseUrl = await getRegistryUrl();
  if (!baseUrl) {
    throw new Error('Registry server not available');
  }

  const trpc = getTRPCClient(baseUrl);
  return trpc.hook.getDeliverableContext.query({ planId, sessionToken });
}
