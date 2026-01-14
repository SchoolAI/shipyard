import { execSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { ServerBlockNoteEditor } from '@blocknote/server-util';
import {
  type ArtifactType,
  addArtifact,
  createPlanUrl,
  getArtifacts,
  getDeliverables,
  getLinkedPRs,
  getPlanMetadata,
  type LinkedPR,
  linkArtifactToDeliverable,
  linkPR,
  logPlanEvent,
  PLAN_INDEX_DOC_NAME,
  setPlanIndexEntry,
  setPlanMetadata,
} from '@peer-plan/schema';
import { nanoid } from 'nanoid';
import type * as Y from 'yjs';
import { z } from 'zod';
import { webConfig } from '../config/env/web.js';
import { getOrCreateDoc } from '../doc-store.js';
import {
  GitHubAuthError,
  getOctokit,
  isArtifactsEnabled,
  isGitHubConfigured,
  parseRepoString,
  uploadArtifact,
} from '../github-artifacts.js';
import { logger } from '../logger.js';
import { verifySessionToken } from '../session-token.js';
import { TOOL_NAMES } from './tool-names.js';

// --- Input Schema ---

const AddArtifactInput = z
  .object({
    planId: z.string().describe('The plan ID to add artifact to'),
    sessionToken: z.string().describe('Session token from create_plan'),
    type: z.enum(['screenshot', 'video', 'test_results', 'diff']).describe('Artifact type'),
    filename: z.string().describe('Filename for the artifact'),
    content: z.string().optional().describe('Base64 encoded file content'),
    filePath: z.string().optional().describe('Local file path to upload'),
    contentUrl: z.string().optional().describe('URL to fetch content from'),
    description: z.string().optional().describe('What this artifact proves (deliverable name)'),
    deliverableId: z.string().optional().describe('ID of the deliverable this artifact fulfills'),
  })
  .refine((data) => {
    const provided = [data.content, data.filePath, data.contentUrl].filter(Boolean).length;
    return provided === 1;
  }, 'Exactly one of content, filePath, or contentUrl must be provided');

// --- Public Export ---

export const addArtifactTool = {
  definition: {
    name: TOOL_NAMES.ADD_ARTIFACT,
    description: `Upload an artifact (screenshot, video, test results, diff) to a plan as proof of work.

AUTO-COMPLETE: When ALL deliverables have artifacts attached, the task automatically completes:
- Status changes to 'completed'
- PR auto-links from current git branch
- Snapshot URL returned for embedding in PR

This means you usually don't need to call complete_task - just upload artifacts for all deliverables.

REQUIREMENTS:
- Plan must have repo set (from create_plan or auto-detected)
- GitHub authentication: run 'gh auth login' or set GITHUB_TOKEN env var

CONTENT OPTIONS (provide exactly one):
- filePath: Local file path (e.g., "/path/to/screenshot.png") - RECOMMENDED
- contentUrl: URL to fetch content from
- content: Base64 encoded (legacy)

DELIVERABLE LINKING:
- Pass deliverableId to link artifact to a deliverable
- If using Claude Code hooks, deliverable IDs are provided after plan approval
- Otherwise, call read_plan to get deliverable IDs

ARTIFACT TYPES:
- screenshot: PNG, JPG images of UI, terminal output
- video: MP4 recordings of feature demos
- test_results: JSON test output, coverage reports
- diff: Code changes, git diffs`,
    inputSchema: {
      type: 'object',
      properties: {
        planId: { type: 'string', description: 'The plan ID to add artifact to' },
        sessionToken: { type: 'string', description: 'Session token from create_plan' },
        type: {
          type: 'string',
          enum: ['screenshot', 'video', 'test_results', 'diff'],
          description: 'Artifact type for rendering',
        },
        filename: {
          type: 'string',
          description: 'Filename with extension (e.g., screenshot.png, demo.mp4)',
        },
        content: {
          type: 'string',
          description: 'Base64 encoded file content (legacy, prefer filePath or contentUrl)',
        },
        filePath: {
          type: 'string',
          description: 'Local file path to upload (e.g., "/path/to/screenshot.png")',
        },
        contentUrl: {
          type: 'string',
          description: 'URL to fetch content from (e.g., "https://example.com/image.png")',
        },
        description: {
          type: 'string',
          description: 'Human-readable description of what this artifact proves',
        },
        deliverableId: {
          type: 'string',
          description:
            'ID of the deliverable this fulfills (from read_plan output). Automatically marks deliverable as completed.',
        },
      },
      required: ['planId', 'sessionToken', 'type', 'filename'],
    },
  },

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Handler has necessary validation and error handling for artifact uploads
  handler: async (args: unknown) => {
    const input = AddArtifactInput.parse(args);
    const { planId, sessionToken, type, filename } = input;

    logger.info({ planId, type, filename }, 'Adding artifact');

    // Resolve content from filePath, contentUrl, or direct content
    let content: string;
    if (input.filePath) {
      logger.info({ filePath: input.filePath }, 'Reading file from path');
      try {
        const fileBuffer = await readFile(input.filePath);
        content = fileBuffer.toString('base64');
      } catch (error) {
        logger.error({ error, filePath: input.filePath }, 'Failed to read file');
        const message = error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [{ type: 'text', text: `Failed to read file: ${message}` }],
          isError: true,
        };
      }
    } else if (input.contentUrl) {
      logger.info({ contentUrl: input.contentUrl }, 'Fetching content from URL');
      try {
        const response = await fetch(input.contentUrl);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        content = Buffer.from(arrayBuffer).toString('base64');
      } catch (error) {
        logger.error({ error, contentUrl: input.contentUrl }, 'Failed to fetch URL');
        const message = error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [{ type: 'text', text: `Failed to fetch URL: ${message}` }],
          isError: true,
        };
      }
    } else if (input.content) {
      content = input.content;
    } else {
      return {
        content: [
          {
            type: 'text',
            text: 'Must provide exactly one of: content, filePath, or contentUrl',
          },
        ],
        isError: true,
      };
    }

    // Check if artifacts feature is disabled
    if (!isArtifactsEnabled()) {
      return {
        content: [
          {
            type: 'text',
            text: 'Artifact uploads are disabled.\n\nTo enable, set PEER_PLAN_ARTIFACTS=enabled in your .mcp.json env config.',
          },
        ],
        isError: true,
      };
    }

    // Check GitHub authentication
    if (!isGitHubConfigured()) {
      return {
        content: [
          {
            type: 'text',
            text: 'GitHub authentication required for artifact uploads.\n\nTo authenticate, run this in your terminal:\n  gh auth login\n\nAlternatives:\n• Set GITHUB_TOKEN environment variable\n• Set PEER_PLAN_ARTIFACTS=disabled to skip artifact uploads',
          },
        ],
        isError: true,
      };
    }

    // Get the plan
    const doc = await getOrCreateDoc(planId);
    const metadata = getPlanMetadata(doc);

    if (!metadata) {
      return {
        content: [{ type: 'text', text: `Plan "${planId}" not found.` }],
        isError: true,
      };
    }

    // Verify session token
    if (
      !metadata.sessionTokenHash ||
      !verifySessionToken(sessionToken, metadata.sessionTokenHash)
    ) {
      return {
        content: [{ type: 'text', text: `Invalid session token for plan "${planId}".` }],
        isError: true,
      };
    }

    // Check for repo
    if (!metadata.repo) {
      return {
        content: [
          {
            type: 'text',
            text: 'Plan must have repo set to upload artifacts.\n\nUse create_plan with repo parameter first.',
          },
        ],
        isError: true,
      };
    }

    try {
      // Upload to GitHub
      const url = await uploadArtifact({
        repo: metadata.repo,
        planId,
        filename,
        content,
      });

      // Add to Y.Doc
      const artifact = {
        id: nanoid(),
        type: type as ArtifactType,
        filename,
        url,
        description: input.description,
        uploadedAt: Date.now(),
      };
      addArtifact(doc, artifact);
      logPlanEvent(doc, 'artifact_uploaded', 'agent', { artifactId: artifact.id });

      // Link to deliverable if specified
      let statusChanged = false;
      if (input.deliverableId) {
        const linked = linkArtifactToDeliverable(doc, input.deliverableId, artifact.id);
        if (linked) {
          logger.info(
            { planId, artifactId: artifact.id, deliverableId: input.deliverableId },
            'Artifact linked to deliverable'
          );

          // Auto-progress status to in_progress when a deliverable is fulfilled
          if (metadata.status === 'draft') {
            setPlanMetadata(doc, { status: 'in_progress' });
            statusChanged = true;
            logger.info({ planId }, 'Plan status auto-changed to in_progress');
          }
        } else {
          logger.warn(
            { planId, deliverableId: input.deliverableId },
            'Failed to link artifact: deliverable not found'
          );
        }
      }

      logger.info({ planId, artifactId: artifact.id, url }, 'Artifact added');

      const linkedText = input.deliverableId
        ? `\nLinked to deliverable: ${input.deliverableId}`
        : '';

      // Check if all deliverables are now fulfilled → auto-complete
      const deliverables = getDeliverables(doc);
      const allFulfilled = deliverables.length > 0 && deliverables.every((d) => d.linkedArtifactId);

      if (allFulfilled) {
        logger.info({ planId }, 'All deliverables fulfilled, auto-completing task');

        // Auto-link PR from current branch
        let linkedPR: LinkedPR | null = null;
        const existingLinkedPRs = getLinkedPRs(doc);
        if (metadata.repo && existingLinkedPRs.length === 0) {
          linkedPR = await tryAutoLinkPR(doc, metadata.repo);
          if (linkedPR) {
            logger.info(
              { planId, prNumber: linkedPR.prNumber, branch: linkedPR.branch },
              'Auto-linked PR from current branch'
            );
          }
        }

        // Generate snapshot URL
        const editor = ServerBlockNoteEditor.create();
        const fragment = doc.getXmlFragment('document');
        const blocks = editor.yXmlFragmentToBlocks(fragment);
        const artifacts = getArtifacts(doc);

        const baseUrl = webConfig.PEER_PLAN_WEB_URL;
        const snapshotUrl = createPlanUrl(baseUrl, {
          v: 1,
          id: planId,
          title: metadata.title,
          status: 'completed',
          repo: metadata.repo,
          pr: metadata.pr,
          content: blocks,
          artifacts,
          deliverables,
        });

        // Update metadata
        setPlanMetadata(doc, {
          status: 'completed',
          completedAt: Date.now(),
          completedBy: 'agent',
          snapshotUrl,
        });

        // Update plan index
        const indexDoc = await getOrCreateDoc(PLAN_INDEX_DOC_NAME);
        if (metadata.ownerId) {
          setPlanIndexEntry(indexDoc, {
            id: metadata.id,
            title: metadata.title,
            status: 'completed',
            createdAt: metadata.createdAt ?? Date.now(),
            updatedAt: Date.now(),
            ownerId: metadata.ownerId,
          });
        } else {
          logger.warn({ planId }, 'Cannot update plan index: missing ownerId');
        }

        logger.info({ planId, snapshotUrl }, 'Task auto-completed');

        // Build completion response
        let prText = '';
        if (linkedPR) {
          prText = `\n\nPR linked: #${linkedPR.prNumber} (${linkedPR.status})\nBranch: ${linkedPR.branch}\nURL: ${linkedPR.url}`;
        } else if (existingLinkedPRs.length > 0) {
          prText = `\n\nExisting linked PR: #${existingLinkedPRs[0]?.prNumber}`;
        }

        return {
          content: [
            {
              type: 'text',
              text: `Artifact uploaded!\nID: ${artifact.id}\nType: ${type}\nFilename: ${filename}\nURL: ${url}${linkedText}

🎉 ALL DELIVERABLES COMPLETE! Task auto-completed.

Snapshot URL: ${snapshotUrl}${prText}

Embed this snapshot URL in your PR description as proof of completed work.`,
            },
          ],
        };
      }

      // Not all deliverables fulfilled yet
      const statusText = statusChanged ? '\nStatus: draft → in_progress (auto-updated)' : '';
      const remainingCount = deliverables.filter((d) => !d.linkedArtifactId).length;
      const remainingText =
        remainingCount > 0 ? `\n\n${remainingCount} deliverable(s) remaining.` : '';

      return {
        content: [
          {
            type: 'text',
            text: `Artifact uploaded!\nID: ${artifact.id}\nType: ${type}\nFilename: ${filename}\nURL: ${url}${linkedText}${statusText}${remainingText}`,
          },
        ],
      };
    } catch (error) {
      logger.error({ error, planId, filename }, 'Failed to upload artifact');

      // Provide clear, actionable error message for auth failures
      if (error instanceof GitHubAuthError) {
        return {
          content: [
            {
              type: 'text',
              text: `GitHub Authentication Error\n\n${error.message}`,
            },
          ],
          isError: true,
        };
      }

      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        content: [
          {
            type: 'text',
            text: `Failed to upload artifact: ${message}`,
          },
        ],
        isError: true,
      };
    }
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

    const linkedPR: LinkedPR = {
      prNumber: pr.number,
      url: pr.html_url,
      linkedAt: Date.now(),
      status: pr.draft ? 'draft' : 'open',
      branch,
      title: pr.title,
    };

    // Store in Y.Doc
    linkPR(ydoc, linkedPR);

    return linkedPR;
  } catch (error) {
    logger.warn({ error, repo, branch }, 'Failed to lookup PR from GitHub');
    return null;
  }
}
