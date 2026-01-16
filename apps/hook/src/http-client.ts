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
 * Get the registry server base URL.
 * Tries each port until one responds.
 */
async function getRegistryUrl(): Promise<string | null> {
  const ports = registryConfig.REGISTRY_PORT;

  for (const port of ports) {
    try {
      const url = `http://localhost:${port}`;
      const res = await fetch(`${url}/registry`, {
        signal: AbortSignal.timeout(3000), // Increased from 1000ms to handle slow responses
      });
      if (res.ok) {
        logger.debug({ port }, 'Found registry server');
        return url;
      }
      logger.debug({ port, status: res.status }, 'Registry responded but not ok');
    } catch (err) {
      logger.debug({ port, error: (err as Error).message }, 'Failed to connect to registry port');
      // Try next port
    }
  }

  logger.warn({ ports }, 'No registry server found on any port');
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
