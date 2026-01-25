import { writeFile } from 'node:fs/promises';
import { ServerBlockNoteEditor } from '@blocknote/server-util';
import {
  type ArtifactType,
  addArtifact,
  addSnapshot,
  createPlanSnapshot,
  getDeliverables,
  getPlanMetadata,
  linkArtifactToDeliverable,
  logPlanEvent,
  transitionPlanStatus,
} from '@shipyard/schema';
import { z } from 'zod';
import { registryConfig } from '../config/env/registry.js';
import { getOrCreateDoc } from '../doc-store.js';
import { GitHubAuthError, isArtifactsEnabled } from '../github-artifacts.js';
import { logger } from '../logger.js';
import { getGitHubUsername } from '../server-identity.js';
import { verifySessionToken } from '../session-token.js';
import {
  type ContentSource,
  resolveArtifactContent,
  uploadArtifactWithFallback,
} from './artifact-helpers.js';
import { performAutoComplete } from './pr-helpers.js';
import { TOOL_NAMES } from './tool-names.js';

/** --- Input Schema --- */

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

/** --- Response Helpers --- */

type ToolResponse = {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
  snapshotUrl?: string;
  allDeliverablesComplete?: boolean;
};

function errorResponse(message: string): ToolResponse {
  return { content: [{ type: 'text', text: message }], isError: true };
}

function successResponse(message: string): ToolResponse {
  return { content: [{ type: 'text', text: message }] };
}

/** --- Validation Functions --- */

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

/**
 * Extracts ContentSource from parsed input.
 */
function getContentSource(input: z.infer<typeof AddArtifactInput>): ContentSource {
  if (input.source === 'file') {
    return { source: 'file', filePath: input.filePath };
  }
  if (input.source === 'url') {
    return { source: 'url', contentUrl: input.contentUrl };
  }
  return { source: 'base64', content: input.content };
}

/**
 * Validates session and returns metadata or error response.
 */
async function validateSessionAndGetMetadata(
  planId: string,
  sessionToken: string
): Promise<
  | {
      success: true;
      doc: Awaited<ReturnType<typeof getOrCreateDoc>>;
      metadata: NonNullable<ReturnType<typeof getPlanMetadata>>;
    }
  | { success: false; response: ToolResponse }
> {
  const doc = await getOrCreateDoc(planId);
  const metadata = getPlanMetadata(doc);

  if (!metadata) {
    return { success: false, response: errorResponse(`Plan "${planId}" not found.`) };
  }

  if (!metadata.sessionTokenHash || !verifySessionToken(sessionToken, metadata.sessionTokenHash)) {
    return {
      success: false,
      response: errorResponse(`Invalid session token for plan "${planId}".`),
    };
  }

  return { success: true, doc, metadata };
}

/**
 * Computes artifact URL from discriminated union.
 */
function getArtifactUrl(artifact: {
  storage: string;
  url?: string;
  localArtifactId?: string;
}): string {
  return artifact.storage === 'github'
    ? (artifact.url ?? '')
    : `http://localhost:${registryConfig.REGISTRY_PORT}/artifacts/${artifact.localArtifactId}`;
}

/** --- Public Export --- */

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

  handler: async (args: unknown) => {
    const input = AddArtifactInput.parse(args);
    const { planId, sessionToken, type, filename } = input;

    /** Validate artifact type matches file extension */
    const validatedType: ArtifactType =
      type === 'html' || type === 'image' || type === 'video' ? type : 'html';
    validateArtifactType(validatedType, filename);

    /** Get actor name and resolve content */
    const actorName = await getGitHubUsername();
    logger.info({ planId, type, filename }, 'Adding artifact');

    const contentResult = await resolveArtifactContent(getContentSource(input));
    if (!contentResult.success) {
      return errorResponse(contentResult.error);
    }

    /** Check if artifacts feature is disabled */
    if (!isArtifactsEnabled()) {
      return errorResponse(
        'Artifact uploads are disabled.\n\nTo enable, set SHIPYARD_ARTIFACTS=enabled in your .mcp.json env config.'
      );
    }

    /** Validate session and get plan metadata */
    const validation = await validateSessionAndGetMetadata(planId, sessionToken);
    if (!validation.success) {
      return validation.response;
    }

    /** Process artifact upload (extracted to reduce complexity) */
    return processArtifactUpload({
      doc: validation.doc,
      metadata: validation.metadata,
      input,
      actorName,
      planId,
      type,
      filename,
      validatedType,
      content: contentResult.content,
    });
  },
};

/**
 * Core artifact upload processing after validation.
 */
async function processArtifactUpload(params: {
  doc: Awaited<ReturnType<typeof getOrCreateDoc>>;
  metadata: NonNullable<ReturnType<typeof getPlanMetadata>>;
  input: z.infer<typeof AddArtifactInput>;
  actorName: string;
  planId: string;
  type: string;
  filename: string;
  validatedType: ArtifactType;
  content: string;
}): Promise<ToolResponse> {
  const { doc, metadata, input, actorName, planId, type, filename, validatedType, content } =
    params;
  let cleanupOnFailure: (() => Promise<void>) | null = null;

  try {
    const uploadResult = await uploadArtifactWithFallback({
      planId,
      filename,
      content,
      validatedType,
      description: input.description,
      repo: metadata.repo,
    });
    const { artifact } = uploadResult;
    cleanupOnFailure = uploadResult.cleanupOnFailure;

    /** Add to Y.Doc */
    addArtifact(doc, artifact, actorName);

    /** Link to deliverable if specified */
    const statusChanged = input.deliverableId
      ? handleDeliverableLinking(
          doc,
          input.deliverableId,
          artifact.id,
          actorName,
          metadata.status,
          planId
        )
      : false;

    /** Compute artifact URL */
    const artifactUrl = getArtifactUrl(artifact);
    logger.info({ planId, artifactId: artifact.id, url: artifactUrl }, 'Artifact added');

    const linkedText = input.deliverableId ? `\nLinked to deliverable: ${input.deliverableId}` : '';

    /** Check if all deliverables are now fulfilled -> auto-complete */
    const deliverables = getDeliverables(doc);
    const allFulfilled = deliverables.length > 0 && deliverables.every((d) => d.linkedArtifactId);

    if (allFulfilled) {
      const result = await handleAutoComplete(
        doc,
        metadata,
        deliverables,
        actorName,
        planId,
        artifact,
        type,
        filename,
        artifactUrl,
        linkedText,
        () => {
          cleanupOnFailure = null;
        }
      );
      return result;
    }

    /** Not all deliverables fulfilled yet */
    cleanupOnFailure = null;
    return buildPartialCompletionResponse(
      artifact,
      type,
      filename,
      artifactUrl,
      linkedText,
      statusChanged,
      deliverables
    );
  } catch (error) {
    return handleUploadError(error, cleanupOnFailure, planId, filename);
  }
}

/**
 * Builds response when not all deliverables are fulfilled.
 */
function buildPartialCompletionResponse(
  artifact: { id: string },
  type: string,
  filename: string,
  artifactUrl: string,
  linkedText: string,
  statusChanged: boolean,
  deliverables: ReturnType<typeof getDeliverables>
): ToolResponse {
  const statusText = statusChanged ? '\nStatus: draft -> in_progress (auto-updated)' : '';
  const remainingCount = deliverables.filter((d) => !d.linkedArtifactId).length;
  const remainingText = remainingCount > 0 ? `\n\n${remainingCount} deliverable(s) remaining.` : '';
  return successResponse(
    `Artifact uploaded!\nID: ${artifact.id}\nType: ${type}\nFilename: ${filename}\nURL: ${artifactUrl}${linkedText}${statusText}${remainingText}`
  );
}

/**
 * Handles errors during upload with cleanup.
 */
async function handleUploadError(
  error: unknown,
  cleanupOnFailure: (() => Promise<void>) | null,
  planId: string,
  filename: string
): Promise<ToolResponse> {
  logger.error({ error, planId, filename }, 'Failed to add artifact to Y.Doc');

  if (cleanupOnFailure) {
    await cleanupOnFailure();
  }

  if (error instanceof GitHubAuthError) {
    return errorResponse(`GitHub Authentication Error\n\n${error.message}`);
  }

  const message = error instanceof Error ? error.message : 'Unknown error';
  return errorResponse(`Failed to upload artifact: ${message}`);
}

/**
 * Handles linking an artifact to a deliverable and auto-progressing status.
 * Returns true if status was changed to in_progress.
 */
function handleDeliverableLinking(
  doc: Awaited<ReturnType<typeof getOrCreateDoc>>,
  deliverableId: string,
  artifactId: string,
  actorName: string,
  currentStatus: string,
  planId: string
): boolean {
  const linked = linkArtifactToDeliverable(doc, deliverableId, artifactId, actorName);
  if (!linked) {
    logger.warn({ planId, deliverableId }, 'Failed to link artifact: deliverable not found');
    return false;
  }

  logPlanEvent(doc, 'deliverable_linked', actorName, { deliverableId, artifactId });
  logger.info({ planId, artifactId, deliverableId }, 'Artifact linked to deliverable');

  /** Auto-progress status to in_progress when a deliverable is fulfilled */
  if (currentStatus !== 'draft') {
    return false;
  }

  const transitionResult = transitionPlanStatus(
    doc,
    { status: 'in_progress', reviewedAt: Date.now(), reviewedBy: actorName },
    actorName
  );
  if (!transitionResult.success) {
    logger.warn({ planId, error: transitionResult.error }, 'Failed to auto-progress status');
    return false;
  }

  /** Create snapshot on status change */
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

  logger.info({ planId }, 'Plan status auto-changed to in_progress');
  return true;
}

/**
 * Handles auto-completion when all deliverables are fulfilled.
 */
async function handleAutoComplete(
  doc: Awaited<ReturnType<typeof getOrCreateDoc>>,
  metadata: NonNullable<ReturnType<typeof getPlanMetadata>>,
  deliverables: ReturnType<typeof getDeliverables>,
  actorName: string,
  planId: string,
  artifact: { id: string },
  type: string,
  filename: string,
  artifactUrl: string,
  linkedText: string,
  markCleanupDone: () => void
) {
  logger.info({ planId }, 'All deliverables fulfilled, auto-completing task');

  /** Use shared auto-completion logic */
  const result = await performAutoComplete({
    ydoc: doc,
    metadata,
    deliverables,
    actorName,
    snapshotMessage: 'Task completed - all deliverables fulfilled',
  });

  /** Write snapshot URL to file (avoids token limit in response) */
  const { homedir } = await import('node:os');
  const { join } = await import('node:path');
  const { mkdir } = await import('node:fs/promises');

  const snapshotsDir = join(homedir(), '.shipyard', 'snapshots');
  await mkdir(snapshotsDir, { recursive: true });

  const snapshotFile = join(snapshotsDir, `${planId}.txt`);
  await writeFile(snapshotFile, result.snapshotUrl, 'utf-8');

  logger.info({ planId, snapshotFile }, 'Snapshot URL written to file');

  /** Build completion response */
  let prText = '';
  if (result.linkedPR) {
    prText = `\n\nPR linked: #${result.linkedPR.prNumber} (${result.linkedPR.status})\nBranch: ${result.linkedPR.branch}\nURL: ${result.linkedPR.url}`;
  } else if (result.existingLinkedPRs.length > 0) {
    prText = `\n\nExisting linked PR: #${result.existingLinkedPRs[0]?.prNumber}`;
  }

  /** Success - no cleanup needed */
  markCleanupDone();

  return {
    content: [
      {
        type: 'text',
        text: `Artifact uploaded!\nID: ${artifact.id}\nType: ${type}\nFilename: ${filename}\nURL: ${artifactUrl}${linkedText}

ALL DELIVERABLES COMPLETE! Task auto-completed.${prText}

Snapshot URL saved to: ${snapshotFile}
(Note: Very long URL - recommend not reading directly. Use file path to attach to PR or access later.)${
          result.hasLocalArtifacts
            ? '\n\nWARNING: This plan contains local artifacts that will not be visible to remote viewers. For full remote access, configure GITHUB_TOKEN to upload artifacts to GitHub.'
            : ''
        }`,
      },
    ],
    /** Keep structured data for execute_code wrapper */
    snapshotUrl: result.snapshotUrl,
    allDeliverablesComplete: true,
    isError: false as const,
  };
}
