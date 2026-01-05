#!/usr/bin/env node
/**
 * Peer-Plan Hook Entry Point
 *
 * This CLI is invoked by Claude Code (or other agents) as a hook.
 * It reads JSON from stdin, processes the event, and writes JSON to stdout.
 *
 * Usage:
 *   echo '{"session_id": "...", ...}' | peer-plan-hook
 */

import open from 'open';
import { claudeCodeAdapter } from './adapters/claude-code.js';
import type { AdapterEvent, AgentAdapter, CoreResponse } from './adapters/types.js';
import { DEFAULT_AGENT_TYPE } from './constants.js';
import { createPlan, updateContent } from './core/plan-manager.js';
import { checkReviewStatus } from './core/review-status.js';
import { logger } from './logger.js';
import { cleanStaleSessions } from './state.js';

// --- Adapter Selection ---

/**
 * Get the appropriate adapter based on environment or input detection.
 * For now, we default to Claude Code adapter.
 */
function getAdapter(): AgentAdapter {
  // Future: Could detect adapter type from input or environment
  return claudeCodeAdapter;
}

// --- Event Handlers ---

/**
 * Handle plan_start event (agent entering plan mode).
 */
async function handlePlanStart(
  event: Extract<AdapterEvent, { type: 'plan_start' }>
): Promise<CoreResponse> {
  try {
    const result = await createPlan({
      sessionId: event.sessionId,
      agentType: DEFAULT_AGENT_TYPE,
      metadata: event.metadata,
    });

    // Open browser with plan URL (cross-platform)
    try {
      await open(result.url);
      logger.info({ url: result.url }, 'Browser opened');
    } catch (err) {
      logger.warn({ err, url: result.url }, 'Failed to open browser, continuing anyway');
    }

    return {
      allow: true,
      message: `Plan created: ${result.url}`,
      planId: result.planId,
      url: result.url,
    };
  } catch (err) {
    logger.error({ err }, 'Failed to create plan');
    // Fail open - allow the operation to proceed
    return { allow: true };
  }
}

/**
 * Handle content_update event (agent writing to plan file).
 */
async function handleContentUpdate(
  event: Extract<AdapterEvent, { type: 'content_update' }>
): Promise<CoreResponse> {
  try {
    await updateContent({
      sessionId: event.sessionId,
      filePath: event.filePath,
      content: event.content,
      agentType: DEFAULT_AGENT_TYPE,
    });

    return { allow: true };
  } catch (err) {
    logger.error({ err }, 'Failed to update content');
    // Fail open - allow the operation to proceed
    return { allow: true };
  }
}

/**
 * Handle plan_exit event (agent trying to exit plan mode).
 */
async function handlePlanExit(
  event: Extract<AdapterEvent, { type: 'plan_exit' }>
): Promise<CoreResponse> {
  try {
    return await checkReviewStatus(event.sessionId);
  } catch (err) {
    logger.error({ err }, 'Failed to check review status');
    // Fail open - allow the operation to proceed
    return { allow: true };
  }
}

// --- Main Entry Point ---

/**
 * Process a hook event and return the response.
 */
async function processEvent(_adapter: AgentAdapter, event: AdapterEvent): Promise<CoreResponse> {
  switch (event.type) {
    case 'plan_start':
      return handlePlanStart(event);

    case 'content_update':
      return handleContentUpdate(event);

    case 'plan_exit':
      return handlePlanExit(event);

    case 'disconnect':
      // Could clear presence here if needed
      return { allow: true };

    case 'passthrough':
      return { allow: true };

    default: {
      // Exhaustive check
      const _exhaustive: never = event;
      logger.warn({ event: _exhaustive }, 'Unknown event type');
      return { allow: true };
    }
  }
}

/**
 * Read all data from stdin.
 */
async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];

  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }

  return Buffer.concat(chunks).toString('utf-8');
}

/**
 * Main function - orchestrates the hook flow.
 */
async function main(): Promise<void> {
  try {
    // Clean stale sessions periodically
    cleanStaleSessions();

    // Read input from stdin
    const stdin = await readStdin();

    if (!stdin.trim()) {
      logger.debug('Empty stdin, passing through');
      // biome-ignore lint/suspicious/noConsole: Hook output MUST go to stdout
      console.log(JSON.stringify({ continue: true }));
      return;
    }

    // Get adapter and parse input
    const adapter = getAdapter();
    const event = adapter.parseInput(stdin);

    logger.debug({ event }, 'Parsed event');

    // Process event
    const response = await processEvent(adapter, event);

    // Format and output response
    const output = adapter.formatOutput(response);
    // biome-ignore lint/suspicious/noConsole: Hook output MUST go to stdout
    console.log(output);
  } catch (err) {
    // On any error, fail open
    logger.error({ err }, 'Hook error, failing open');
    // biome-ignore lint/suspicious/noConsole: Hook output MUST go to stdout
    console.log(JSON.stringify({ continue: true }));
  }
}

// Run main
main();
