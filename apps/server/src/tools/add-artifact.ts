import { readFile } from 'node:fs/promises';
import {
  type ArtifactType,
  addArtifact,
  getPlanMetadata,
  linkArtifactToDeliverable,
} from '@peer-plan/schema';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { isArtifactsEnabled, isGitHubConfigured, uploadArtifact } from '../github-artifacts.js';
import { logger } from '../logger.js';
import { verifySessionToken } from '../session-token.js';
import { getOrCreateDoc } from '../ws-server.js';
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
    description: `Upload an artifact (screenshot, video, test results, diff) to a plan. Provides proof that deliverables were completed.

REQUIREMENTS:
- Plan must have repo and prNumber set (from create_plan)
- GitHub authentication required: run 'gh auth login' or set GITHUB_TOKEN env var
- Artifacts stored in GitHub orphan branch 'plan-artifacts'

CONTENT OPTIONS (provide exactly one):
- content: Base64 encoded file content (legacy, still supported)
- filePath: Local file path to read and upload (e.g., "/path/to/screenshot.png")
- contentUrl: URL to fetch content from (e.g., "https://example.com/image.png")

DELIVERABLE LINKING:
- Call read_plan with includeAnnotations=false to see deliverable IDs: {id="block-id"}
- Pass deliverableId to automatically mark that deliverable as completed (checkmark)
- Multiple artifacts can link to the same deliverable
- Artifacts without deliverableId are stored but not linked

ARTIFACT TYPES:
- screenshot: PNG, JPG images of UI, terminal output, etc.
- video: MP4 recordings of feature demos, walkthroughs
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

    // Check for repo/pr
    if (!metadata.repo || !metadata.pr) {
      return {
        content: [
          {
            type: 'text',
            text: 'Plan must have repo and PR set to upload artifacts.\n\nUse create_plan with repo and prNumber parameters first.',
          },
        ],
        isError: true,
      };
    }

    try {
      // Upload to GitHub
      const url = await uploadArtifact({
        repo: metadata.repo,
        pr: metadata.pr,
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

      // Link to deliverable if specified
      if (input.deliverableId) {
        const linked = linkArtifactToDeliverable(doc, input.deliverableId, artifact.id);
        if (linked) {
          logger.info(
            { planId, artifactId: artifact.id, deliverableId: input.deliverableId },
            'Artifact linked to deliverable'
          );
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

      return {
        content: [
          {
            type: 'text',
            text: `Artifact uploaded!\nID: ${artifact.id}\nType: ${type}\nFilename: ${filename}\nURL: ${url}${linkedText}`,
          },
        ],
      };
    } catch (error) {
      logger.error({ error, planId, filename }, 'Failed to upload artifact');
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
