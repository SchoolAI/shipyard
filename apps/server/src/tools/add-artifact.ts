import { readFile, writeFile } from 'node:fs/promises';
import { ServerBlockNoteEditor } from '@blocknote/server-util';
import {
  type Artifact,
  type ArtifactType,
  addArtifact,
  addSnapshot,
  createPlanSnapshot,
  createPlanUrlWithHistory,
  type GitHubArtifact,
  getArtifacts,
  getDeliverables,
  getLinkedPRs,
  getPlanMetadata,
  getSnapshots,
  type LinkedPR,
  type LocalArtifact,
  linkArtifactToDeliverable,
  logPlanEvent,
  PLAN_INDEX_DOC_NAME,
  setPlanIndexEntry,
  transitionPlanStatus,
} from '@shipyard/schema';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { registryConfig } from '../config/env/registry.js';
import { webConfig } from '../config/env/web.js';
import { getOrCreateDoc } from '../doc-store.js';
import {
  GitHubAuthError,
  isArtifactsEnabled,
  isGitHubConfigured,
  uploadArtifact,
} from '../github-artifacts.js';
import { deleteLocalArtifact, storeLocalArtifact } from '../local-artifacts.js';
import { logger } from '../logger.js';
import { getGitHubUsername } from '../server-identity.js';
import { verifySessionToken } from '../session-token.js';
import { tryAutoLinkPR } from './pr-helpers.js';
import { TOOL_NAMES } from './tool-names.js';

// --- Input Schema ---

const AddArtifactInputBase = z.object({
  planId: z.string().describe('The plan ID to add artifact to'),
  sessionToken: z.string().describe('Session token from create_plan'),
  type: z.enum(['html', 'image', 'video']).describe('Artifact type'),
  filename: z.string().describe('Filename for the artifact'),
  description: z.string().optional().describe('What this artifact proves (deliverable name)'),
  deliverableId: z.string().optional().describe('ID of the deliverable this artifact fulfills'),
});

const AddArtifactInput = z.discriminatedUnion('source', [
  AddArtifactInputBase.extend({
    source: z.literal('file'),
    filePath: z.string().describe('Local file path to upload'),
  }),
  AddArtifactInputBase.extend({
    source: z.literal('url'),
    contentUrl: z.string().describe('URL to fetch content from'),
  }),
  AddArtifactInputBase.extend({
    source: z.literal('base64'),
    content: z.string().describe('Base64 encoded file content'),
  }),
]);

// --- Validation Functions ---

/**
 * Validates that the artifact type matches the file extension.
 * Throws a helpful error with suggestions if the extension is invalid.
 */
function validateArtifactType(type: ArtifactType, filename: string): void {
  const ext = filename.split('.').pop()?.toLowerCase();

  const validExtensions: Record<ArtifactType, string[]> = {
    html: ['html', 'htm'],
    image: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'],
    video: ['mp4', 'webm', 'mov', 'avi'],
  };

  const valid = validExtensions[type];
  if (!valid || !ext || !valid.includes(ext)) {
    const suggestions: Record<ArtifactType, string> = {
      html: 'HTML is the primary format for test results, terminal output, code reviews, and structured data. Use self-contained HTML with inline CSS and base64 images.',
      image:
        'Images are for actual UI screenshots only. For terminal output or test results, use type: "html" instead.',
      video:
        'Videos are for browser automation flows and complex interactions. For static content, use type: "image" or "html".',
    };

    throw new Error(
      `Invalid file extension for artifact type '${type}'.\n\n` +
        `Expected: ${valid?.join(', ') || 'unknown'}\n` +
        `Got: ${ext || 'no extension'}\n\n` +
        `Tip: ${suggestions[type]}`
    );
  }
}

// --- Public Export ---

export const addArtifactTool = {
  definition: {
    name: TOOL_NAMES.ADD_ARTIFACT,
    description: `Upload an artifact (screenshot, video, test results, diff) to a task as proof of work.

AUTO-COMPLETE: When ALL deliverables have artifacts attached, the task automatically completes:
- Status changes to 'completed'
- PR auto-links from current git branch
- Snapshot URL returned for embedding in PR

This means you usually don't need to call complete_task - just upload artifacts for all deliverables.

STORAGE STRATEGY:
- Tries GitHub upload first (if configured and repo is set)
- Falls back to local storage if GitHub fails or isn't configured
- Local artifacts served via HTTP endpoint on registry server

REQUIREMENTS:
- For GitHub storage: repo must be set + 'gh auth login' or GITHUB_TOKEN
- For local storage: no requirements (automatic fallback)

CONTENT SOURCE (specify via 'source' field):
- source='file' + filePath: Local file path (e.g., "/path/to/screenshot.png") - RECOMMENDED
- source='url' + contentUrl: URL to fetch content from
- source='base64' + content: Base64 encoded (legacy)

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
          enum: ['html', 'image', 'video'],
          description: 'Artifact type for rendering',
        },
        filename: {
          type: 'string',
          description: 'Filename with extension (e.g., screenshot.png, demo.mp4)',
        },
        source: {
          type: 'string',
          enum: ['file', 'url', 'base64'],
          description:
            'Content source type: file (local path), url (fetch from URL), or base64 (direct content)',
        },
        filePath: {
          type: 'string',
          description: 'Local file path to upload (required when source=file)',
        },
        contentUrl: {
          type: 'string',
          description: 'URL to fetch content from (required when source=url)',
        },
        content: {
          type: 'string',
          description: 'Base64 encoded file content (required when source=base64)',
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
      required: ['planId', 'sessionToken', 'type', 'filename', 'source'],
    },
  },

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Handler has necessary validation and error handling for artifact uploads
  handler: async (args: unknown) => {
    const input = AddArtifactInput.parse(args);
    const { planId, sessionToken, type, filename } = input;

    // Validate artifact type matches file extension (before any file operations)
    const validatedType: ArtifactType =
      type === 'html' || type === 'image' || type === 'video' ? type : 'html';
    validateArtifactType(validatedType, filename);

    // Get actor name for event logging
    const actorName = await getGitHubUsername();

    logger.info({ planId, type, filename }, 'Adding artifact');

    // Resolve content based on discriminated source type
    let content: string;

    switch (input.source) {
      case 'file': {
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
        break;
      }

      case 'url': {
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
        break;
      }

      case 'base64': {
        content = input.content;
        break;
      }

      default: {
        const _exhaustive: never = input;
        throw new Error(`Unhandled source type: ${JSON.stringify(_exhaustive)}`);
      }
    }

    // Check if artifacts feature is disabled
    if (!isArtifactsEnabled()) {
      return {
        content: [
          {
            type: 'text',
            text: 'Artifact uploads are disabled.\n\nTo enable, set SHIPYARD_ARTIFACTS=enabled in your .mcp.json env config.',
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

    // Determine storage strategy: Try GitHub first (if configured), fall back to local
    // Store artifact and track cleanup handler in case Y.Doc update fails
    let artifact: Artifact;
    let cleanupOnFailure: (() => Promise<void>) | null = null;
    const githubConfigured = isGitHubConfigured();
    const hasRepo = !!metadata.repo;

    try {
      if (githubConfigured && hasRepo) {
        try {
          // Try GitHub upload (repo is guaranteed by hasRepo check above)
          if (!metadata.repo) {
            throw new Error('Repo not set');
          }
          const url = await uploadArtifact({
            repo: metadata.repo,
            planId,
            filename,
            content,
          });

          // Type-safe: GitHubArtifact MUST have url
          artifact = {
            id: nanoid(),
            type: validatedType,
            filename,
            storage: 'github',
            url,
            description: input.description,
            uploadedAt: Date.now(),
          } satisfies GitHubArtifact;

          logger.info({ planId, artifactId: artifact.id }, 'Artifact uploaded to GitHub');
          // No cleanup needed for GitHub - artifacts persist independently
        } catch (error) {
          // GitHub upload failed - fall back to local
          logger.warn({ error, planId }, 'GitHub upload failed, falling back to local storage');

          const buffer = Buffer.from(content, 'base64');
          const localArtifactId = await storeLocalArtifact(planId, filename, buffer);

          artifact = {
            id: nanoid(),
            type: validatedType,
            filename,
            storage: 'local',
            localArtifactId,
            description: input.description,
            uploadedAt: Date.now(),
          } satisfies LocalArtifact;

          // Set cleanup handler for local artifacts
          cleanupOnFailure = async () => {
            await deleteLocalArtifact(localArtifactId);
          };

          logger.info(
            { planId, artifactId: artifact.id },
            'Artifact stored locally (GitHub fallback)'
          );
        }
      } else {
        // Use local storage directly
        const buffer = Buffer.from(content, 'base64');
        const localArtifactId = await storeLocalArtifact(planId, filename, buffer);

        artifact = {
          id: nanoid(),
          type: validatedType,
          filename,
          storage: 'local',
          localArtifactId,
          description: input.description,
          uploadedAt: Date.now(),
        } satisfies LocalArtifact;

        // Set cleanup handler for local artifacts
        cleanupOnFailure = async () => {
          await deleteLocalArtifact(localArtifactId);
        };

        const reason = !githubConfigured ? 'GitHub not configured' : 'No repo set';
        logger.info({ planId, artifactId: artifact.id, reason }, 'Artifact stored locally');
      }

      // Add to Y.Doc
      addArtifact(doc, artifact, actorName);

      // Link to deliverable if specified
      let statusChanged = false;
      if (input.deliverableId) {
        const linked = linkArtifactToDeliverable(doc, input.deliverableId, artifact.id, actorName);
        if (linked) {
          logPlanEvent(doc, 'deliverable_linked', actorName, {
            deliverableId: input.deliverableId,
            artifactId: artifact.id,
          });

          logger.info(
            { planId, artifactId: artifact.id, deliverableId: input.deliverableId },
            'Artifact linked to deliverable'
          );

          // Auto-progress status to in_progress when a deliverable is fulfilled
          if (metadata.status === 'draft') {
            const transitionResult = transitionPlanStatus(
              doc,
              {
                status: 'in_progress',
                reviewedAt: Date.now(),
                reviewedBy: actorName,
              },
              actorName
            );
            if (!transitionResult.success) {
              logger.warn(
                { planId, error: transitionResult.error },
                'Failed to auto-progress status to in_progress'
              );
            }

            // Create snapshot on status change (Issue #42)
            const editor = ServerBlockNoteEditor.create();
            const fragment = doc.getXmlFragment('document');
            const blocks = editor.yXmlFragmentToBlocks(fragment);
            const snapshot = createPlanSnapshot(
              doc,
              'First deliverable linked',
              actorName,
              'in_progress',
              blocks
            );
            addSnapshot(doc, snapshot);

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

      // Compute artifact URL from discriminated union
      const artifactUrl =
        artifact.storage === 'github'
          ? artifact.url
          : `http://localhost:${registryConfig.REGISTRY_PORT}/artifacts/${artifact.localArtifactId}`;

      logger.info({ planId, artifactId: artifact.id, url: artifactUrl }, 'Artifact added');

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

        // Generate snapshot URL with version history
        const editor = ServerBlockNoteEditor.create();
        const fragment = doc.getXmlFragment('document');
        const blocks = editor.yXmlFragmentToBlocks(fragment);
        const artifacts = getArtifacts(doc);

        // Check if any artifacts are stored locally (won't be visible to remote viewers)
        const hasLocalArtifacts = artifacts.some((a) => a.storage === 'local');

        // Create completion snapshot (Issue #42)
        const completionSnapshot = createPlanSnapshot(
          doc,
          'Task completed - all deliverables fulfilled',
          actorName,
          'completed',
          blocks
        );
        addSnapshot(doc, completionSnapshot);

        // Get all snapshots for URL encoding
        const allSnapshots = getSnapshots(doc);

        const baseUrl = webConfig.SHIPYARD_WEB_URL;
        const snapshotUrl = createPlanUrlWithHistory(
          baseUrl,
          {
            id: planId,
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
          doc,
          {
            status: 'completed',
            completedAt,
            completedBy: actorName,
            snapshotUrl,
          },
          actorName
        );
        logPlanEvent(doc, 'completed', actorName);

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
            deleted: false,
          });
        } else {
          logger.warn({ planId }, 'Cannot update plan index: missing ownerId');
        }

        logger.info({ planId, snapshotUrl }, 'Task auto-completed');

        // Write snapshot URL to file (avoids token limit in response)
        const { homedir } = await import('node:os');
        const { join } = await import('node:path');
        const { mkdir } = await import('node:fs/promises');

        const snapshotsDir = join(homedir(), '.shipyard', 'snapshots');
        await mkdir(snapshotsDir, { recursive: true });

        const snapshotFile = join(snapshotsDir, `${planId}.txt`);
        await writeFile(snapshotFile, snapshotUrl, 'utf-8');

        logger.info({ planId, snapshotFile }, 'Snapshot URL written to file');

        // Build completion response
        let prText = '';
        if (linkedPR) {
          prText = `\n\nPR linked: #${linkedPR.prNumber} (${linkedPR.status})\nBranch: ${linkedPR.branch}\nURL: ${linkedPR.url}`;
        } else if (existingLinkedPRs.length > 0) {
          prText = `\n\nExisting linked PR: #${existingLinkedPRs[0]?.prNumber}`;
        }

        // Success - no cleanup needed
        cleanupOnFailure = null;

        return {
          content: [
            {
              type: 'text',
              text: `Artifact uploaded!\nID: ${artifact.id}\nType: ${type}\nFilename: ${filename}\nURL: ${artifactUrl}${linkedText}

🎉 ALL DELIVERABLES COMPLETE! Task auto-completed.${prText}

Snapshot URL saved to: ${snapshotFile}
(Note: Very long URL - recommend not reading directly. Use file path to attach to PR or access later.)${
                hasLocalArtifacts
                  ? '\n\n⚠️ WARNING: This plan contains local artifacts that will not be visible to remote viewers. For full remote access, configure GITHUB_TOKEN to upload artifacts to GitHub.'
                  : ''
              }`,
            },
          ],
          // Keep structured data for execute_code wrapper
          snapshotUrl: snapshotUrl,
          allDeliverablesComplete: true,
        };
      }

      // Not all deliverables fulfilled yet
      const statusText = statusChanged ? '\nStatus: draft → in_progress (auto-updated)' : '';
      const remainingCount = deliverables.filter((d) => !d.linkedArtifactId).length;
      const remainingText =
        remainingCount > 0 ? `\n\n${remainingCount} deliverable(s) remaining.` : '';

      // Success - no cleanup needed
      cleanupOnFailure = null;

      return {
        content: [
          {
            type: 'text',
            text: `Artifact uploaded!\nID: ${artifact.id}\nType: ${type}\nFilename: ${filename}\nURL: ${artifactUrl}${linkedText}${statusText}${remainingText}`,
          },
        ],
      };
    } catch (error) {
      logger.error({ error, planId, filename }, 'Failed to add artifact to Y.Doc');

      // Cleanup orphaned local artifact
      if (cleanupOnFailure) {
        await cleanupOnFailure();
      }

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
