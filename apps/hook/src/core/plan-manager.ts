/**
 * Core plan management logic.
 * Creates plans, updates content, and manages session state.
 *
 * NOTE: This is hook-specific orchestration that calls server APIs via HTTP.
 * The server's create-plan.ts tool and hook-api.ts serve different purposes:
 * - Hook: Client-side orchestration, session state
 * - Server tool: MCP tool for agents without hook support (Cursor, Devin)
 * - Server hook-api: HTTP handlers that this code calls (includes browser opening)
 */

import type { CreateHookSessionResponse } from '@peer-plan/schema';
import { computeHash } from '@peer-plan/shared';
import { DEFAULT_AGENT_TYPE } from '../constants.js';
import { createSession, updatePlanContent, updatePresence } from '../http-client.js';
import { logger } from '../logger.js';

// --- In-Memory Session Tracking ---
// Simple in-memory map for tracking sessionId → planId during hook process lifetime
// Server handles persistence in session registry
const sessionToPlan = new Map<
  string,
  { planId: string; lastContentHash?: string; filePath?: string }
>();

// --- Plan Creation ---

export interface CreatePlanOptions {
  sessionId: string;
  agentType: string;
  metadata?: Record<string, unknown>;
}

/**
 * Create a new plan for a session.
 * Called when agent enters plan mode.
 */
export async function createPlan(options: CreatePlanOptions): Promise<CreateHookSessionResponse> {
  const { sessionId, agentType, metadata } = options;

  logger.info({ sessionId, agentType }, 'Creating plan for session');

  const response = await createSession({
    sessionId,
    agentType,
    metadata,
  });

  // Track session → planId in memory (server handles persistence)
  sessionToPlan.set(sessionId, {
    planId: response.planId,
  });

  // Set initial presence
  await updatePresence(response.planId, {
    agentType,
    sessionId,
  });

  logger.info({ sessionId, planId: response.planId, url: response.url }, 'Plan created by server');

  return response;
}

// --- Content Updates ---

export interface UpdateContentOptions {
  sessionId: string;
  filePath: string;
  content: string;
  agentType?: string;
}

/**
 * Update plan content.
 * Called when agent writes/edits the plan file.
 * Auto-creates plan if this is the first write.
 */
export async function updateContent(options: UpdateContentOptions): Promise<boolean> {
  const { sessionId, filePath, content, agentType } = options;

  let session = sessionToPlan.get(sessionId);

  // First write - create the plan
  if (!session) {
    logger.info({ sessionId, filePath }, 'First write detected, creating plan');

    await createPlan({
      sessionId,
      agentType: agentType ?? DEFAULT_AGENT_TYPE,
      metadata: { filePath },
    });

    session = sessionToPlan.get(sessionId);
    if (!session) {
      logger.error({ sessionId }, 'Failed to track session after plan creation');
      return false;
    }
  }

  // Check if content actually changed
  const contentHash = computeHash(content);
  if (session.lastContentHash === contentHash) {
    logger.debug({ sessionId }, 'Content unchanged, skipping update');
    return true;
  }

  logger.info({ sessionId, planId: session.planId, filePath }, 'Updating plan content');

  await updatePlanContent(session.planId, {
    content,
    filePath,
  });

  // Update in-memory tracking
  sessionToPlan.set(sessionId, {
    ...session,
    filePath,
    lastContentHash: contentHash,
  });

  // Update presence (heartbeat)
  if (agentType) {
    await updatePresence(session.planId, {
      agentType,
      sessionId,
    });
  }

  return true;
}

// --- Helpers ---
// computeHash moved to @peer-plan/shared
