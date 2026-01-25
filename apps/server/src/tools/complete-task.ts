import { execSync } from 'node:child_process';
import { ServerBlockNoteEditor } from '@blocknote/server-util';
import {
  addSnapshot,
  createLinkedPR,
  createPlanSnapshot,
  createPlanUrlWithHistory,
  GitHubPRResponseSchema,
  getArtifacts,
  getDeliverables,
  getLinkedPRs,
  getPlanIndexDocName,
  getPlanMetadata,
  getSnapshots,
  type LinkedPR,
  linkPR,
  logPlanEvent,
  setPlanIndexEntry,
  transitionPlanStatus,
} from '@shipyard/schema';
import type * as Y from 'yjs';
import { z } from 'zod';
import { webConfig } from '../config/env/web.js';
import { getOrCreateDoc } from '../doc-store.js';
import { getOctokit, parseRepoString } from '../github-artifacts.js';
import { logger } from '../logger.js';
import { getGitHubUsername } from '../server-identity.js';
import { verifySessionToken } from '../session-token.js';
import { TOOL_NAMES } from './tool-names.js';

const CompleteTaskInput = z.object({
  planId: z.string().describe('ID of the plan to complete'),
  sessionToken: z.string().describe('Session token from create_plan'),
  summary: z.string().optional().describe('Optional completion summary'),
});

export const completeTaskTool = {
  definition: {
    name: TOOL_NAMES.COMPLETE_TASK,
    description: `Mark a task as complete and generate a snapshot URL for embedding in a PR.

NOTE: You usually DON'T need this tool! When you use add_artifact to upload proof for ALL deliverables, the task auto-completes and returns the snapshot URL automatically.

USE THIS TOOL ONLY IF:
- You need to force completion without all deliverables fulfilled
- The plan has no deliverables marked
- Auto-complete didn't trigger for some reason

REQUIREMENTS:
- Plan status must be 'in_progress'
- At least one artifact should be uploaded

RETURNS:
- Snapshot URL with complete plan state embedded
- Auto-links PR from current git branch if available`,
    inputSchema: {
      type: 'object',
      properties: {
        planId: { type: 'string', description: 'ID of the plan to complete' },
        sessionToken: { type: 'string', description: 'Session token from create_plan' },
        summary: {
          type: 'string',
          description: 'Optional completion summary for PR description',
        },
      },
      required: ['planId', 'sessionToken'],
    },
  },

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Tool handler requires validation, auto-linking, and response formatting
  handler: async (args: unknown) => {
    const input = CompleteTaskInput.parse(args);
    const ydoc = await getOrCreateDoc(input.planId);
    const metadata = getPlanMetadata(ydoc);

    if (!metadata) {
      return {
        content: [{ type: 'text', text: 'Plan not found' }],
        isError: true,
      };
    }

    // Verify session token
    if (
      !metadata.sessionTokenHash ||
      !verifySessionToken(input.sessionToken, metadata.sessionTokenHash)
    ) {
      return {
        content: [{ type: 'text', text: `Invalid session token for plan "${input.planId}".` }],
        isError: true,
      };
    }

    // Validate status (must be in_progress)
    if (metadata.status !== 'in_progress') {
      return {
        content: [
          {
            type: 'text',
            text: `Cannot complete: plan status is '${metadata.status}', must be 'in_progress'`,
          },
        ],
        isError: true,
      };
    }

    // Check artifacts exist
    const artifacts = getArtifacts(ydoc);
    // Check if any artifacts are stored locally (won't be visible to remote viewers)
    const hasLocalArtifacts = artifacts.some((a) => a.storage === 'local');

    if (artifacts.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: 'Cannot complete: no deliverables attached. Upload artifacts first using add_artifact.',
          },
        ],
        isError: true,
      };
    }

    // Get deliverables with linkage info
    const deliverables = getDeliverables(ydoc);

    // Auto-link PR from current branch
    let linkedPR: LinkedPR | null = null;
    const existingLinkedPRs = getLinkedPRs(ydoc);

    if (metadata.repo && existingLinkedPRs.length === 0) {
      linkedPR = await tryAutoLinkPR(ydoc, metadata.repo);
      if (linkedPR) {
        logger.info(
          { planId: input.planId, prNumber: linkedPR.prNumber, branch: linkedPR.branch },
          'Auto-linked PR from current branch'
        );
      }
    }

    // Get content blocks from Y.Doc
    const editor = ServerBlockNoteEditor.create();
    const fragment = ydoc.getXmlFragment('document');
    const blocks = editor.yXmlFragmentToBlocks(fragment);

    // Get GitHub username for actor
    const actorName = await getGitHubUsername();

    // Create completion snapshot (Issue #42)
    const completionSnapshot = createPlanSnapshot(
      ydoc,
      'Task marked complete',
      actorName,
      'completed',
      blocks
    );
    addSnapshot(ydoc, completionSnapshot);

    // Get all snapshots for URL encoding
    const allSnapshots = getSnapshots(ydoc);

    // Generate snapshot URL with version history
    const baseUrl = webConfig.SHIPYARD_WEB_URL;
    const snapshotUrl = createPlanUrlWithHistory(
      baseUrl,
      {
        id: input.planId,
        title: metadata.title,
        status: 'completed',
        repo: metadata.repo,
        pr: metadata.pr,
        content: blocks,
        artifacts,
        deliverables,
      },
      allSnapshots
    );

    // Update metadata
    const completedAt = Date.now();
    transitionPlanStatus(
      ydoc,
      {
        status: 'completed',
        completedAt,
        completedBy: actorName,
        snapshotUrl,
      },
      actorName
    );

    // Log completion event (Issue #42 - was missing!)
    logPlanEvent(ydoc, 'completed', actorName);

    // Update plan index
    if (metadata.ownerId) {
      const indexDoc = await getOrCreateDoc(getPlanIndexDocName(metadata.ownerId));
      setPlanIndexEntry(indexDoc, {
        id: metadata.id,
        title: metadata.title,
        status: 'completed',
        createdAt: metadata.createdAt ?? Date.now(),
        updatedAt: Date.now(),
        ownerId: metadata.ownerId,
        deleted: false,
      });
    } else {
      logger.warn({ planId: input.planId }, 'Cannot update plan index: missing ownerId');
    }

    logger.info({ planId: input.planId }, 'Task marked complete');

    // Build response message
    let responseText = `Task completed!\n\nSnapshot URL: ${snapshotUrl}`;

    if (linkedPR) {
      responseText += `\n\nLinked PR: #${linkedPR.prNumber} (${linkedPR.status})
Branch: ${linkedPR.branch}
URL: ${linkedPR.url}

The PR is now visible in the "Changes" tab of your plan.`;
    } else if (!metadata.repo) {
      responseText += `\n\nNote: No PR auto-linked (plan has no repo set).`;
    } else if (existingLinkedPRs.length > 0) {
      responseText += `\n\nExisting linked PR: #${existingLinkedPRs[0]?.prNumber}`;
    } else {
      responseText += `\n\nNo open PR found on current branch. You can:

1. Create a new PR:
\`\`\`
gh pr create --title "${metadata.title}" --body "## Summary
${input.summary || 'Task completed.'}

## Deliverables
[View Plan + Artifacts](${snapshotUrl})

---
Generated with [Shipyard](https://github.com/SchoolAI/shipyard)"
\`\`\`

2. Or link an existing PR manually:
\`\`\`
linkPR({ planId, sessionToken, prNumber: 42 })
\`\`\``;
    }

    // Add warning if plan contains local artifacts
    if (hasLocalArtifacts) {
      responseText +=
        '\n\n⚠️ WARNING: This plan contains local artifacts that will not be visible to remote viewers. For full remote access, configure GITHUB_TOKEN to upload artifacts to GitHub.';
    }

    return {
      content: [{ type: 'text', text: responseText }],
    };
  },
};

// --- Helper Functions ---

/**
 * Tries to auto-link a PR from the current git branch.
 * Returns the linked PR if found, null otherwise.
 */
async function tryAutoLinkPR(ydoc: Y.Doc, repo: string): Promise<LinkedPR | null> {
  // Get current branch
  let branch: string;
  try {
    branch = execSync('git branch --show-current', {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch (error) {
    logger.debug({ error }, 'Could not detect current git branch');
    return null;
  }

  if (!branch) {
    logger.debug('Not on a branch (possibly detached HEAD)');
    return null;
  }

  // Get Octokit instance
  const octokit = getOctokit();
  if (!octokit) {
    logger.debug('No GitHub token available for PR lookup');
    return null;
  }

  // Parse repo
  const { owner, repoName } = parseRepoString(repo);

  try {
    // Look for open PRs from this branch
    const { data: prs } = await octokit.pulls.list({
      owner,
      repo: repoName,
      head: `${owner}:${branch}`,
      state: 'open',
    });

    if (prs.length === 0) {
      logger.debug({ branch, repo }, 'No open PR found on branch');
      return null;
    }

    // Use the first (most recent) PR
    const pr = prs[0];
    if (!pr) return null;

    // Validate GitHub API response
    const validatedPR = GitHubPRResponseSchema.parse(pr);

    // Create LinkedPR object using factory for consistent validation
    const linkedPR = createLinkedPR({
      prNumber: validatedPR.number,
      url: validatedPR.html_url,
      // We query for state: 'open' only, so merged/closed are never returned
      status: validatedPR.draft ? 'draft' : 'open',
      branch,
      title: validatedPR.title,
    });

    // Store in Y.Doc
    const actorName = await getGitHubUsername();
    linkPR(ydoc, linkedPR, actorName);

    // Log PR linked event (semantic action)
    logPlanEvent(ydoc, 'pr_linked', actorName, {
      prNumber: linkedPR.prNumber,
      url: linkedPR.url,
    });

    return linkedPR;
  } catch (error) {
    // Validation errors indicate malformed GitHub API response
    if (error instanceof z.ZodError) {
      const fieldErrors = error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join(', ');
      logger.error({ fieldErrors, repo, branch }, 'Invalid GitHub PR response during auto-link');
      return null;
    }
    logger.warn({ error, repo, branch }, 'Failed to lookup PR from GitHub');
    return null;
  }
}
