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
import { getOrCreateDoc } from '../ws-server.js';
import { TOOL_NAMES } from './tool-names.js';

// --- Input Schema ---

const AddArtifactInput = z.object({
  planId: z.string().describe('The plan ID to add artifact to'),
  type: z.enum(['screenshot', 'video', 'test_results', 'diff']).describe('Artifact type'),
  filename: z.string().describe('Filename for the artifact'),
  content: z.string().describe('Base64 encoded file content'),
  description: z.string().optional().describe('What this artifact proves (deliverable name)'),
  deliverableId: z.string().optional().describe('ID of the deliverable this artifact fulfills'),
});

// --- Public Export ---

export const addArtifactTool = {
  definition: {
    name: TOOL_NAMES.ADD_ARTIFACT,
    description:
      'Upload an artifact (screenshot, video, test results, diff) to a plan. Requires GITHUB_TOKEN env var and plan must have repo/pr set.\n\nIf linking to a deliverable, call read_plan first to see deliverable IDs, then pass the deliverable ID to automatically mark it as completed.',
    inputSchema: {
      type: 'object',
      properties: {
        planId: { type: 'string', description: 'The plan ID to add artifact to' },
        type: {
          type: 'string',
          enum: ['screenshot', 'video', 'test_results', 'diff'],
          description: 'Artifact type',
        },
        filename: { type: 'string', description: 'Filename for the artifact' },
        content: { type: 'string', description: 'Base64 encoded file content' },
        description: {
          type: 'string',
          description: 'What this artifact proves (deliverable name)',
        },
        deliverableId: {
          type: 'string',
          description: 'ID of the deliverable this artifact fulfills',
        },
      },
      required: ['planId', 'type', 'filename', 'content'],
    },
  },

  handler: async (args: unknown) => {
    const input = AddArtifactInput.parse(args);
    const { planId, type, filename, content } = input;

    logger.info({ planId, type, filename }, 'Adding artifact');

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
