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
import { cleanStaleSessions, deleteSessionState, getSessionState } from './state.js';

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
    return await checkReviewStatus(event.sessionId, event.planContent);
  } catch (err) {
    logger.error({ err }, 'Failed to check review status');
    // Fail open - allow the operation to proceed
    return { allow: true };
  }
}

/**
 * Handle post_exit event (after ExitPlanMode completes).
 * Injects session context (sessionToken, planId, URL, deliverables) for Claude to use.
 */
async function handlePostExit(
  event: Extract<AdapterEvent, { type: 'post_exit' }>
): Promise<CoreResponse> {
  const state = getSessionState(event.sessionId);

  if (!state?.sessionToken) {
    logger.debug({ sessionId: event.sessionId }, 'No session token found for PostToolUse');
    return {
      allow: true,
      hookType: 'post_tool_use',
      additionalContext: '',
    };
  }

  const { planId, sessionToken, url, deliverables } = state;

  logger.info(
    { planId, deliverableCount: deliverables?.length ?? 0 },
    'Injecting session context via PostToolUse'
  );

  // Clear the session state now that we've delivered the token
  deleteSessionState(event.sessionId);

  // Format deliverables for Claude
  let deliverablesSection = '';
  if (deliverables && deliverables.length > 0) {
    deliverablesSection = `\n## Deliverables\n\nAttach proof to each deliverable using add_artifact:\n\n`;
    for (const d of deliverables) {
      deliverablesSection += `- ${d.text}\n  deliverableId="${d.id}"\n`;
    }
  } else {
    deliverablesSection = `\n## Deliverables\n\nNo deliverables marked in this plan. You can still upload artifacts without linking them.`;
  }

  const context = `[PEER-PLAN] Plan approved! 🎉
${deliverablesSection}
## Session Info

planId="${planId}"
sessionToken="${sessionToken}"
url="${url}"

## How to Attach Proof

For each deliverable above, call:
\`\`\`
add_artifact(
  planId="${planId}",
  sessionToken="${sessionToken}",
  type="screenshot",  // or "video", "test_results", "diff"
  filePath="/path/to/file.png",
  deliverableId="<id from above>"
)
\`\`\`

When the LAST deliverable gets an artifact, the task auto-completes and returns a snapshot URL for your PR.`;

  return {
    allow: true,
    hookType: 'post_tool_use',
    additionalContext: context,
    planId,
    sessionToken,
    url,
  };
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

    case 'post_exit':
      return handlePostExit(event);

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
 * Output SessionStart context for Claude to see.
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

  // Output in Claude Code hook JSON format
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
    // Handle --context flag for SessionStart hooks
    if (process.argv.includes('--context')) {
      outputSessionStartContext();
      // Don't call process.exit - let process end naturally to avoid pino flush errors
      return;
    }

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
    logger.debug({ output }, 'Sending hook response');
    // biome-ignore lint/suspicious/noConsole: Hook output MUST go to stdout
    console.log(output);
    process.exit(0);
  } catch (err) {
    // On any error, fail open with allow
    logger.error({ err }, 'Hook error, failing open');
    // biome-ignore lint/suspicious/noConsole: Hook output MUST go to stdout
    console.log(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PermissionRequest',
          decision: {
            behavior: 'allow',
          },
        },
      })
    );
    process.exit(0);
  }
}

// Run main
main();
