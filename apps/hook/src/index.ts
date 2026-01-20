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

import { claudeCodeAdapter } from './adapters/claude-code.js';
import type { AdapterEvent, AgentAdapter, CoreResponse } from './adapters/types.js';
import { DEFAULT_AGENT_TYPE } from './constants.js';
import { createPlan, updateContent } from './core/plan-manager.js';
import { checkReviewStatus } from './core/review-status.js';
import { getDeliverableContext, getSessionContext } from './http-client.js';
import { logger } from './logger.js';

function getAdapter(): AgentAdapter {
  return claudeCodeAdapter;
}

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

    return {
      allow: true,
      message: `Plan created at ${result.url}. Write your plan, mark deliverables with {#deliverable}, then exit plan mode to await approval.`,
      planId: result.planId,
      url: result.url,
    };
  } catch (err) {
    /*
     * Fail-open policy: plan creation failure shouldn't block agent work.
     * The agent can still proceed without peer-plan features.
     */
    logger.error({ err }, 'Failed to create plan');
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
    throw err;
  }
}

/**
 * Handle plan_exit event (agent trying to exit plan mode).
 */
async function handlePlanExit(
  event: Extract<AdapterEvent, { type: 'plan_exit' }>
): Promise<CoreResponse> {
  try {
    return await checkReviewStatus(event.sessionId, event.planContent, event.metadata);
  } catch (err) {
    const error = err as Error & { code?: string; cause?: Error };
    logger.error(
      { err: error, message: error.message, code: error.code },
      'Failed to check review status'
    );

    const isConnectionError =
      error.code === 'ECONNREFUSED' ||
      error.code === 'ECONNRESET' ||
      error.code === 'ETIMEDOUT' ||
      error.code === 'ENOTFOUND' ||
      error.message?.includes('connect') ||
      error.message?.includes('timeout') ||
      error.message?.includes('WebSocket') ||
      error.message?.includes('not available');

    const message = isConnectionError
      ? 'Cannot connect to peer-plan server. Ensure the peer-plan MCP server is running. Check ~/.peer-plan/hook-debug.log for details.'
      : `Review system error: ${error.message}. Check ~/.peer-plan/hook-debug.log for details.`;

    return {
      allow: false,
      message,
    };
  }
}

/**
 * Handle post_exit event (after ExitPlanMode completes).
 * Injects session context (sessionToken, planId, URL, deliverables) for Claude to use.
 * Fetches context from server registry (replaces local state.ts).
 */
async function handlePostExit(
  event: Extract<AdapterEvent, { type: 'post_exit' }>
): Promise<CoreResponse> {
  try {
    const sessionContext = await getSessionContext(event.sessionId);

    if (!sessionContext.found) {
      logger.debug({ sessionId: event.sessionId }, 'No session found in registry');
      return {
        allow: true,
        hookType: 'post_tool_use',
        additionalContext: '',
      };
    }

    const { planId, sessionToken, url } = sessionContext;

    logger.info(
      { planId, sessionId: event.sessionId },
      'Injecting session context via PostToolUse'
    );

    const result = await getDeliverableContext(planId, sessionToken);

    return {
      allow: true,
      hookType: 'post_tool_use',
      additionalContext: result.context,
      planId,
      sessionToken,
      url,
    };
  } catch (err) {
    logger.error({ err, sessionId: event.sessionId }, 'Failed to get session context from server');
    return {
      allow: true,
      hookType: 'post_tool_use',
      additionalContext: '',
    };
  }
}

async function processEvent(_adapter: AgentAdapter, event: AdapterEvent): Promise<CoreResponse> {
  switch (event.type) {
    case 'plan_start':
      return handlePlanStart(event);

    case 'content_update':
      return handleContentUpdate(event);

    case 'plan_exit':
      return handlePlanExit(event);

    case 'post_exit':
      return handlePostExit(event);

    case 'disconnect':
      return { allow: true };

    case 'tool_deny':
      return {
        allow: false,
        hookType: 'tool_deny',
        denyReason: event.reason,
      };

    case 'passthrough':
      return { allow: true };

    default: {
      const _exhaustive: never = event;
      logger.warn({ event: _exhaustive }, 'Unknown event type');
      /*
       * Forward compatibility: fail-open for unknown events
       */
      return { allow: true };
    }
  }
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];

  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }

  return Buffer.concat(chunks).toString('utf-8');
}

/**
 * NOTE: Duplication with peer-plan-skill/SKILL.md is intentional.
 * Hook: For Claude Code users with native plan mode (Shift+Tab)
 * Skill: For agents using MCP tool directly without plan mode
 */
function outputSessionStartContext(): void {
  const context = `[PEER-PLAN] Collaborative planning with human review & proof-of-work tracking.

IMPORTANT: Use native plan mode (Shift+Tab) to create plans. The hook handles everything automatically.

## What are Deliverables?

Deliverables are measurable outcomes you can prove with artifacts (screenshots, videos, test results).

Good deliverables (provable):
\`\`\`
- [ ] Screenshot of working login page {#deliverable}
- [ ] Video showing feature in action {#deliverable}
- [ ] Test results showing all tests pass {#deliverable}
\`\`\`

Bad deliverables (implementation details, not provable):
\`\`\`
- [ ] Implement getUserMedia API  ← This is a task, not a deliverable
- [ ] Add error handling          ← Can't prove this with an artifact
\`\`\`

## Workflow

1. Enter plan mode (Shift+Tab) → Browser opens with live plan
2. Write plan with {#deliverable} markers for provable outcomes
3. Exit plan mode → Hook BLOCKS until human approves
4. On approval → You receive planId, sessionToken, and deliverable IDs
5. Do work → Take screenshots/videos as you go
6. \`add_artifact(filePath, deliverableId)\` for each deliverable
7. When all deliverables fulfilled → Auto-completes with snapshot URL

## After Approval

You only need ONE tool: \`add_artifact\`

When the last deliverable gets an artifact, the task auto-completes and returns a snapshot URL for your PR.`;

  const hookOutput = {
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: context,
    },
  };

  // biome-ignore lint/suspicious/noConsole: Hook output MUST go to stdout
  console.log(JSON.stringify(hookOutput));
}

/**
 * Main function - orchestrates the hook flow.
 */
async function main(): Promise<void> {
  try {
    if (process.argv.includes('--context')) {
      outputSessionStartContext();
      return;
    }

    const stdin = await readStdin();

    if (!stdin.trim()) {
      logger.debug('Empty stdin, passing through');
      // biome-ignore lint/suspicious/noConsole: Hook output MUST go to stdout
      console.log(JSON.stringify({ continue: true }));
      return;
    }

    const adapter = getAdapter();
    const event = adapter.parseInput(stdin);

    logger.debug({ event }, 'Parsed event');

    const response = await processEvent(adapter, event);

    const output = adapter.formatOutput(response);
    logger.debug({ output }, 'Sending hook response');
    // biome-ignore lint/suspicious/noConsole: Hook output MUST go to stdout
    console.log(output);
    process.exit(0);
  } catch (err) {
    logger.error({ err }, 'Hook error, failing closed');
    // biome-ignore lint/suspicious/noConsole: Hook output MUST go to stdout
    console.log(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PermissionRequest',
          decision: {
            behavior: 'deny',
            message: `Hook error: ${(err as Error).message}. Check ~/.peer-plan/hook-debug.log for details.`,
          },
        },
      })
    );
    process.exit(0);
  }
}

main();
