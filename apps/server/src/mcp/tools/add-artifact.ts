/**
 * MCP Tool: add_artifact
 *
 * Adds an artifact (file, link, etc.) to the task.
 * Ported from apps/server-legacy/src/tools/add-artifact.ts
 *
 * @see docs/whips/daemon-mcp-server-merge.md#mcp-tools
 */

import { generateArtifactId, type TaskDocument, type TaskMeta } from '@shipyard/loro-schema';
import { z } from 'zod';
import {
  type ArtifactType,
  type ContentSource,
  resolveArtifactContent,
  validateArtifactType,
} from '../../utils/artifact-helpers.js';
import {
  GitHubAuthError,
  isGitHubConfigured,
  uploadArtifact,
} from '../../utils/github-artifacts.js';
import { getGitHubUsername } from '../../utils/identity.js';
import { logger } from '../../utils/logger.js';
import {
  errorResponse,
  getTaskDocument,
  successResponse,
  type ToolResponse,
  verifySessionToken,
} from '../helpers.js';
import type { McpServer } from '../index.js';

/** Tool name constant */
const TOOL_NAME = 'add_artifact';

/** Input Schema - base fields */
const AddArtifactInputBase = z.object({
  taskId: z.string().describe('The task ID to add artifact to'),
  sessionToken: z.string().describe('Session token from create_task'),
  type: z.enum(['html', 'image', 'video']).describe('Artifact type'),
  filename: z.string().describe('Filename for the artifact'),
  description: z.string().optional().describe('What this artifact proves (deliverable name)'),
  deliverableId: z.string().optional().describe('ID of the deliverable this artifact fulfills'),
});

/** Discriminated union for content source */
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

type AddArtifactInputType = z.infer<typeof AddArtifactInput>;

/** Artifact type used for storage */
type Artifact = {
  storage: 'github';
  id: string;
  type: 'html' | 'image' | 'video';
  filename: string;
  description: string | null;
  uploadedAt: number;
  url: string;
};

/** Deliverable shape from the document */
type Deliverable = {
  id: string;
  linkedArtifactId: string | null;
};

// --- Helper Functions ---

/**
 * Convert Zod-parsed input to ContentSource type.
 */
function toContentSource(input: AddArtifactInputType): ContentSource {
  switch (input.source) {
    case 'file':
      return { source: 'file', filePath: input.filePath };
    case 'url':
      return { source: 'url', contentUrl: input.contentUrl };
    case 'base64':
      return { source: 'base64', content: input.content };
  }
}

/**
 * Validate artifact type matches filename extension.
 * Returns error response if invalid, null if valid.
 */
function validateType(type: ArtifactType, filename: string): ToolResponse | null {
  try {
    validateArtifactType(type, filename);
    return null;
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : 'Invalid artifact type');
  }
}

/**
 * Check GitHub configuration and return error if not ready.
 */
function checkGitHubConfig(meta: TaskMeta): ToolResponse | null {
  if (isGitHubConfigured() && meta.repo) {
    return null;
  }

  const reason = !isGitHubConfigured() ? 'GITHUB_TOKEN not set' : 'Task has no repo configured';
  return errorResponse(
    `Cannot upload artifact: ${reason}.\n\nTo enable GitHub uploads:\n1. Set GITHUB_TOKEN in your MCP config\n2. Ensure the task has a repo set`
  );
}

/**
 * Upload artifact to GitHub.
 * Returns the URL on success, or an error response on failure.
 */
async function uploadToGitHub(
  repo: string,
  taskId: string,
  filename: string,
  content: string,
  artifactId: string
): Promise<{ url: string } | { error: ToolResponse }> {
  try {
    const url = await uploadArtifact({
      repo,
      planId: taskId,
      filename,
      content,
    });
    logger.info({ taskId, artifactId, url }, 'Artifact uploaded to GitHub');
    return { url };
  } catch (error) {
    if (error instanceof GitHubAuthError) {
      return { error: errorResponse(`GitHub Authentication Error\n\n${error.message}`) };
    }
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.warn({ taskId, error: message }, 'GitHub upload failed');
    return { error: errorResponse(`Failed to upload artifact: ${message}`) };
  }
}

/**
 * Create artifact object for storage.
 */
function createArtifact(
  artifactId: string,
  type: 'html' | 'image' | 'video',
  filename: string,
  description: string | undefined,
  url: string
): Artifact {
  return {
    storage: 'github',
    id: artifactId,
    type,
    filename,
    description: description ?? null,
    uploadedAt: Date.now(),
    url,
  };
}

/**
 * Link artifact to deliverable if requested and valid.
 */
function linkDeliverable(
  doc: TaskDocument,
  deliverableId: string | undefined,
  artifactId: string,
  actorName: string,
  taskId: string
): void {
  if (!deliverableId) {
    return;
  }

  const deliverables: Deliverable[] = doc.deliverables.toJSON();
  const deliverableIndex = deliverables.findIndex((d) => d.id === deliverableId);

  if (deliverableIndex === -1) {
    return;
  }

  // TODO: Update deliverable with artifact ID
  doc.logEvent('deliverable_linked', actorName, {
    deliverableId,
    artifactId,
    deliverableText: null,
  });
  logger.info({ taskId, artifactId, deliverableId }, 'Artifact linked to deliverable');
}

/**
 * Check if all deliverables are complete.
 */
function checkAllDeliverablesComplete(doc: TaskDocument): {
  allComplete: boolean;
  remaining: number;
} {
  const deliverables: Deliverable[] = doc.deliverables.toJSON();
  const allComplete = deliverables.length > 0 && deliverables.every((d) => d.linkedArtifactId);
  const remaining = deliverables.filter((d) => !d.linkedArtifactId).length;
  return { allComplete, remaining };
}

/**
 * Build success response message for uploaded artifact.
 */
function buildSuccessResponse(
  artifactId: string,
  type: string,
  filename: string,
  deliverableId: string | undefined,
  allComplete: boolean,
  remaining: number
): ToolResponse {
  const linkedText = deliverableId ? `\nLinked to deliverable: ${deliverableId}` : '';

  if (allComplete) {
    return {
      content: [
        {
          type: 'text',
          text: `Artifact uploaded!
ID: ${artifactId}
Type: ${type}
Filename: ${filename}${linkedText}

ALL DELIVERABLES COMPLETE! Task will auto-complete.
(Full auto-completion with snapshot URL pending Loro integration)`,
        },
      ],
    };
  }

  return successResponse(
    `Artifact uploaded!\nID: ${artifactId}\nType: ${type}\nFilename: ${filename}${linkedText}\n\n${remaining} deliverable(s) remaining.`
  );
}

// --- Tool Handler ---

/**
 * Handle the add_artifact tool request.
 */
async function handleAddArtifact(args: unknown): Promise<ToolResponse> {
  const input = AddArtifactInput.parse(args);
  const { taskId, sessionToken, type, filename } = input;

  // Validate artifact type
  const typeError = validateType(type, filename);
  if (typeError) {
    return typeError;
  }

  // Resolve content
  const contentResult = await resolveArtifactContent(toContentSource(input));
  if (!contentResult.success) {
    return errorResponse(contentResult.error);
  }

  // Get task document
  const taskResult = await getTaskDocument(taskId);
  if (!taskResult.success) {
    return errorResponse(taskResult.error);
  }
  const { doc, meta } = taskResult;

  // Verify session token
  const tokenError = verifySessionToken(sessionToken, meta.sessionTokenHash, taskId);
  if (tokenError) {
    return errorResponse(tokenError);
  }

  // Check GitHub configuration
  const configError = checkGitHubConfig(meta);
  if (configError) {
    return configError;
  }

  logger.info({ taskId, type, filename }, 'Adding artifact');

  const artifactId = generateArtifactId();

  // Upload to GitHub (meta.repo is guaranteed non-null by checkGitHubConfig)
  const uploadResult = await uploadToGitHub(
    meta.repo as string,
    taskId,
    filename,
    contentResult.content,
    artifactId
  );
  if ('error' in uploadResult) {
    return uploadResult.error;
  }

  // Create and store artifact
  const artifact = createArtifact(artifactId, type, filename, input.description, uploadResult.url);
  doc.artifacts.push(artifact);

  // Log upload event
  const actorName = await getGitHubUsername();
  doc.logEvent('artifact_uploaded', actorName, {
    artifactId,
    filename,
    artifactType: type,
  });

  // Link to deliverable if requested
  linkDeliverable(doc, input.deliverableId, artifactId, actorName, taskId);

  // Check completion status
  const { allComplete, remaining } = checkAllDeliverablesComplete(doc);

  logger.info({ taskId, artifactId }, 'Artifact added');

  return buildSuccessResponse(
    artifactId,
    type,
    filename,
    input.deliverableId,
    allComplete,
    remaining
  );
}

/**
 * Register the add_artifact tool.
 */
export function registerAddArtifactTool(server: McpServer): void {
  server.tool(
    TOOL_NAME,
    `Upload an artifact (screenshot, video, test results, diff) to a task as proof of work.

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
- If using Claude Code hooks, deliverable IDs are provided after task approval
- Otherwise, call read_task to get deliverable IDs

ARTIFACT TYPES:
- screenshot: PNG, JPG images of UI, terminal output
- video: MP4 recordings of feature demos
- test_results: JSON test output, coverage reports
- diff: Code changes, git diffs`,
    {
      taskId: {
        type: 'string',
        description: 'The task ID to add artifact to',
      },
      sessionToken: {
        type: 'string',
        description: 'Session token from create_task',
      },
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
          'ID of the deliverable this fulfills (from read_task output). Automatically marks deliverable as completed.',
      },
    },
    handleAddArtifact
  );
}
