/**
 * HTTP client for communicating with the peer-plan registry server.
 */

import {
  type CreateHookSessionRequest,
  CreateHookSessionRequestSchema,
  type CreateHookSessionResponse,
  CreateHookSessionResponseSchema,
  type GetReviewStatusResponse,
  GetReviewStatusResponseSchema,
  type UpdatePlanContentRequest,
  UpdatePlanContentRequestSchema,
  type UpdatePlanContentResponse,
  UpdatePlanContentResponseSchema,
  type UpdatePresenceRequest,
  UpdatePresenceRequestSchema,
  type UpdatePresenceResponse,
  UpdatePresenceResponseSchema,
} from '@peer-plan/schema';
import { DEFAULT_REGISTRY_PORTS, REQUEST_TIMEOUT_MS } from './constants.js';
import { logger } from './logger.js';

/**
 * Get the registry server base URL.
 * Tries each port until one responds.
 */
async function getRegistryUrl(): Promise<string | null> {
  const ports = process.env.REGISTRY_PORT
    ? [Number.parseInt(process.env.REGISTRY_PORT, 10)]
    : DEFAULT_REGISTRY_PORTS;

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
 * Get WebSocket URL from registry for Y.Doc sync.
 * Returns the first available WebSocket server URL.
 */
export async function getWebSocketUrl(): Promise<string | null> {
  const baseUrl = await getRegistryUrl();
  if (!baseUrl) {
    logger.warn('getWebSocketUrl: No registry URL available');
    return null;
  }

  try {
    const res = await fetch(`${baseUrl}/registry`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!res.ok) {
      logger.warn({ status: res.status }, 'getWebSocketUrl: Registry returned non-ok status');
      return null;
    }

    const data = (await res.json()) as { servers?: Array<{ url: string }> };

    // Return first available WebSocket server
    const firstServer = data.servers?.[0];
    if (firstServer) {
      logger.debug(
        { wsUrl: firstServer.url, serverCount: data.servers?.length },
        'Found WebSocket server'
      );
      return firstServer.url;
    }

    logger.warn(
      { serverCount: data.servers?.length ?? 0 },
      'getWebSocketUrl: No WebSocket servers registered'
    );
    return null;
  } catch (err) {
    logger.warn({ err }, 'Failed to get WebSocket URL from registry');
    return null;
  }
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

  // Validate request
  CreateHookSessionRequestSchema.parse(request);

  const res = await fetch(`${baseUrl}/api/hook/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Failed to create session: ${res.status} ${error}`);
  }

  const data = await res.json();
  return CreateHookSessionResponseSchema.parse(data);
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

  // Validate request
  UpdatePlanContentRequestSchema.parse(request);

  const res = await fetch(`${baseUrl}/api/hook/plan/${encodeURIComponent(planId)}/content`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Failed to update plan content: ${res.status} ${error}`);
  }

  const data = await res.json();
  return UpdatePlanContentResponseSchema.parse(data);
}

/**
 * Get review status for a plan.
 */
export async function getReviewStatus(planId: string): Promise<GetReviewStatusResponse> {
  const baseUrl = await getRegistryUrl();
  if (!baseUrl) {
    throw new Error('Registry server not available');
  }

  const res = await fetch(`${baseUrl}/api/hook/plan/${encodeURIComponent(planId)}/review`, {
    method: 'GET',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Failed to get review status: ${res.status} ${error}`);
  }

  const data = await res.json();
  return GetReviewStatusResponseSchema.parse(data);
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

  // Validate request
  UpdatePresenceRequestSchema.parse(request);

  const res = await fetch(`${baseUrl}/api/hook/plan/${encodeURIComponent(planId)}/presence`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Failed to update presence: ${res.status} ${error}`);
  }

  const data = await res.json();
  return UpdatePresenceResponseSchema.parse(data);
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

  const res = await fetch(`${baseUrl}/api/hook/plan/${encodeURIComponent(planId)}/session-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionTokenHash }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Failed to set session token: ${res.status} ${error}`);
  }

  const data = (await res.json()) as { url: string };
  return data;
}

/**
 * Clear agent presence.
 */
export async function clearPresence(planId: string, sessionId: string): Promise<void> {
  const baseUrl = await getRegistryUrl();
  if (!baseUrl) {
    logger.warn('Registry server not available, skipping presence clear');
    return;
  }

  try {
    await fetch(
      `${baseUrl}/api/hook/plan/${encodeURIComponent(planId)}/presence?sessionId=${encodeURIComponent(sessionId)}`,
      {
        method: 'DELETE',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      }
    );
  } catch (err) {
    // Non-critical, just log
    logger.warn({ err, planId, sessionId }, 'Failed to clear presence');
  }
}
