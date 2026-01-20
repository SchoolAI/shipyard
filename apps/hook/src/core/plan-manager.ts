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

import type { CreateHookSessionResponse } from '@shipyard/schema';
import { computeHash } from '@shipyard/shared';
import { DEFAULT_AGENT_TYPE } from '../constants.js';
import { createSession, updatePlanContent, updatePresence } from '../http-client.js';
import { logger } from '../logger.js';

const sessionToPlan = new Map<
  string,
  { planId: string; lastContentHash?: string; filePath?: string }
>();

export interface CreatePlanOptions {
  sessionId: string;
  agentType: string;
  metadata?: Record<string, unknown>;
}

export async function createPlan(options: CreatePlanOptions): Promise<CreateHookSessionResponse> {
  const { sessionId, agentType, metadata } = options;

  logger.info({ sessionId, agentType }, 'Creating plan for session');

  const response = await createSession({
    sessionId,
    agentType,
    metadata,
  });

  sessionToPlan.set(sessionId, {
    planId: response.planId,
  });

  await updatePresence(response.planId, {
    agentType,
    sessionId,
  });

  logger.info({ sessionId, planId: response.planId, url: response.url }, 'Plan created by server');

  return response;
}

export interface UpdateContentOptions {
  sessionId: string;
  filePath: string;
  content: string;
  agentType?: string;
}

export async function updateContent(options: UpdateContentOptions): Promise<boolean> {
  const { sessionId, filePath, content, agentType } = options;

  let session = sessionToPlan.get(sessionId);

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

  sessionToPlan.set(sessionId, {
    ...session,
    filePath,
    lastContentHash: contentHash,
  });

  if (agentType) {
    await updatePresence(session.planId, {
      agentType,
      sessionId,
    });
  }

  return true;
}

// --- Helpers ---
// computeHash moved to @shipyard/shared
