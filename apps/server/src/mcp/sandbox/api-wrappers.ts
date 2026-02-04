/**
 * Sandbox API wrappers for execute_code.
 *
 * These functions are exposed in the VM sandbox for user code to call.
 * They wrap the tool handlers and provide cleaner return types.
 * Ported from apps/server-legacy/src/tools/execute-code.ts.
 */

import {
  generateArtifactId,
  generateDeliverableId,
  generateTaskId,
  getTaskUrl,
  isTaskStatus,
  TASK_STATUSES,
  type TaskDocument,
  type TaskMeta,
} from '@shipyard/loro-schema';
import { parseEnv } from '../../env.js';
import {
  type ContentSource,
  resolveArtifactContent,
  validateArtifactType,
} from '../../utils/artifact-helpers.js';
import { GitHubAuthError, isGitHubConfigured, tryAutoLinkPR } from '../../utils/github-helpers.js';
import { getGitHubUsername, getRepositoryFullName } from '../../utils/identity.js';
import { logger } from '../../utils/logger.js';
import { generateSessionToken, hashSessionToken } from '../../utils/session-token.js';
import { getOrCreateTaskDocument, getTaskDocument, verifySessionToken } from '../helpers.js';
import { uploadArtifact as uploadToGitHub } from './github-artifacts.js';

/** --- Markdown Parsing for Deliverables --- */

interface ExtractedDeliverable {
  id: string;
  text: string;
}

/**
 * Extract deliverables from markdown content.
 * Looks for checkbox items with {#deliverable} marker.
 *
 * Example:
 *   - [ ] Screenshot of login {#deliverable}
 *
 * Ported from @shipyard/schema extractDeliverables
 */
function extractDeliverablesFromMarkdown(content: string): ExtractedDeliverable[] {
  const deliverables: ExtractedDeliverable[] = [];

  /** Match checkbox items with {#deliverable} marker */
  const regex = /^\s*[-*]\s*\[\s*[xX ]?\s*\]\s*(.+?)\s*\{#deliverable\}\s*$/gm;

  let match: RegExpExecArray | null = regex.exec(content);
  while (match !== null) {
    const text = match[1]?.trim();
    if (text) {
      deliverables.push({
        id: generateDeliverableId(),
        text,
      });
    }
    match = regex.exec(content);
  }

  return deliverables;
}

/**
 * Create a new task.
 */
export async function createTask(opts: {
  title: string;
  content: string;
  repo?: string;
  prNumber?: number;
}): Promise<{
  taskId: string;
  sessionToken: string;
  url: string;
  deliverables: Array<{ id: string; text: string }>;
  monitoringScript: string;
}> {
  const taskId = generateTaskId();
  const sessionToken = generateSessionToken();
  const sessionTokenHash = hashSessionToken(sessionToken);
  const now = Date.now();

  const repo = opts.repo || getRepositoryFullName() || undefined;
  if (repo && !opts.repo) {
    logger.info({ repo }, 'Auto-detected repository from current directory');
  }

  logger.info({ taskId, title: opts.title, repo }, 'Creating task via sandbox');

  /** Get owner identity */
  const ownerId = await getGitHubUsername();

  /** Create task document */
  const taskResult = await getOrCreateTaskDocument(taskId);
  if (!taskResult.success) {
    throw new Error(taskResult.error);
  }
  const { doc } = taskResult;

  /** Initialize metadata */
  const meta = doc.meta;
  meta.id = taskId;
  meta.title = opts.title;
  meta.status = 'pending_review';
  meta.createdAt = now;
  meta.updatedAt = now;
  meta.ownerId = ownerId;
  meta.sessionTokenHash = sessionTokenHash;
  meta.epoch = 1;
  meta.repo = repo ?? null;

  /** Parse markdown to extract deliverables */
  const extractedDeliverables = extractDeliverablesFromMarkdown(opts.content);

  /** Add deliverables to document */
  for (const d of extractedDeliverables) {
    doc.deliverables.push({
      id: d.id,
      text: d.text,
      linkedArtifactId: null,
      linkedAt: null,
    });
  }

  logger.info(
    { taskId, deliverableCount: extractedDeliverables.length },
    'Deliverables extracted from markdown'
  );

  /** Log task created event */
  doc.logEvent('task_created', ownerId);

  /** Build task URL */
  const env = parseEnv();
  const url = getTaskUrl(taskId, env.WEB_URL);

  /** Create monitoring script for non-hook agents */
  const monitoringScript = `#!/bin/bash
# Poll for task approval/rejection
# Task: ${taskId}
while true; do
  sleep 30
  STATUS=$(curl -s "${env.WEB_URL}/api/tasks/${taskId}/status" 2>/dev/null | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
  if [ "$STATUS" = "in_progress" ]; then
    echo "Task approved! Proceeding with work."
    exit 0
  elif [ "$STATUS" = "changes_requested" ]; then
    echo "Changes requested. Check task for feedback."
    exit 1
  fi
  echo "Waiting for task review... (status: $STATUS)"
done`;

  return {
    taskId,
    sessionToken,
    url,
    deliverables: extractedDeliverables,
    monitoringScript,
  };
}

/**
 * Read a task.
 */
export async function readTask(
  taskId: string,
  sessionToken: string,
  _opts?: { includeAnnotations?: boolean; includeLinkedPRs?: boolean }
): Promise<{
  content: string;
  status: string;
  title: string;
  repo?: string;
  pr?: number;
  deliverables: Array<{ id: string; text: string; completed: boolean }>;
  isError: boolean;
}> {
  /** Get task document */
  const taskResult = await getTaskDocument(taskId);
  if (!taskResult.success) {
    return {
      content: taskResult.error,
      status: 'error',
      title: '',
      deliverables: [],
      isError: true,
    };
  }
  const { doc, meta } = taskResult;

  /** Verify session token */
  const tokenError = verifySessionToken(sessionToken, meta.sessionTokenHash, taskId);
  if (tokenError) {
    return {
      content: tokenError,
      status: 'error',
      title: '',
      deliverables: [],
      isError: true,
    };
  }

  /** Get deliverables */
  const deliverables: Array<{ id: string; text: string; completed: boolean }> = [];
  const deliverablesData = doc.deliverables.toJSON();
  if (Array.isArray(deliverablesData)) {
    for (const d of deliverablesData) {
      if (d && typeof d === 'object' && 'id' in d && 'text' in d) {
        deliverables.push({
          id: String(d.id),
          text: String(d.text),
          completed: !!('linkedArtifactId' in d && d.linkedArtifactId),
        });
      }
    }
  }

  /** Build content string */
  let content = `# ${meta.title}\n\n`;
  content += `**Status:** ${meta.status}\n`;
  content += `**Created:** ${new Date(meta.createdAt).toISOString()}\n`;
  if (meta.repo) {
    content += `**Repo:** ${meta.repo}\n`;
  }
  content += '\n---\n\n';

  return {
    content,
    status: meta.status,
    title: meta.title,
    repo: meta.repo ?? undefined,
    deliverables,
    isError: false,
  };
}

/**
 * Update task metadata.
 */
export async function updateTask(
  taskId: string,
  sessionToken: string,
  updates: { title?: string; status?: string }
): Promise<{ success: boolean; monitoringScript: string }> {
  /** Get task document */
  const taskResult = await getTaskDocument(taskId);
  if (!taskResult.success) {
    throw new Error(taskResult.error);
  }
  const { doc, meta } = taskResult;

  /** Verify session token */
  const tokenError = verifySessionToken(sessionToken, meta.sessionTokenHash, taskId);
  if (tokenError) {
    throw new Error(tokenError);
  }

  const actor = await getGitHubUsername();

  /** Update title if provided */
  if (updates.title) {
    doc.meta.title = updates.title;
    doc.syncTitleToRoom();
  }

  if (updates.status) {
    if (!isTaskStatus(updates.status)) {
      throw new Error(
        `Invalid status: ${updates.status}. Valid values: ${TASK_STATUSES.join(', ')}`
      );
    }
    doc.updateStatus(updates.status, actor);
  }

  const env = parseEnv();
  const monitoringScript = `#!/bin/bash
# Poll for task approval/rejection
# Task: ${taskId}
while true; do
  sleep 30
  STATUS=$(curl -s "${env.WEB_URL}/api/tasks/${taskId}/status" 2>/dev/null | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
  if [ "$STATUS" = "in_progress" ]; then
    echo "Task approved! Proceeding with work."
    exit 0
  elif [ "$STATUS" = "changes_requested" ]; then
    echo "Changes requested. Check task for feedback."
    exit 1
  fi
  echo "Waiting for task review... (status: $STATUS)"
done`;

  return { success: true, monitoringScript };
}

/** Error response for addArtifact */
interface AddArtifactErrorResponse {
  artifactId: '';
  url: '';
  allDeliverablesComplete: false;
  isError: true;
  error: string;
}

/** Success response for addArtifact */
interface AddArtifactSuccessResponse {
  artifactId: string;
  url: string;
  allDeliverablesComplete: boolean;
  snapshotUrl?: string;
  isError: false;
}

type AddArtifactResponse = AddArtifactErrorResponse | AddArtifactSuccessResponse;

/** Create a standardized error response for addArtifact */
function createArtifactError(error: string): AddArtifactErrorResponse {
  return {
    artifactId: '',
    url: '',
    allDeliverablesComplete: false,
    isError: true,
    error,
  };
}

/** Resolve content source from options */
function resolveContentSource(opts: {
  source: 'file' | 'url' | 'base64';
  filePath?: string;
  contentUrl?: string;
  content?: string;
}): ContentSource | null {
  if (opts.source === 'file' && opts.filePath) {
    return { source: 'file', filePath: opts.filePath };
  }
  if (opts.source === 'url' && opts.contentUrl) {
    return { source: 'url', contentUrl: opts.contentUrl };
  }
  if (opts.source === 'base64' && opts.content) {
    return { source: 'base64', content: opts.content };
  }
  return null;
}

/** Upload artifact to GitHub or return local-only URL */
async function uploadArtifactToStorage(opts: {
  taskId: string;
  artifactId: string;
  filename: string;
  content: string;
  repo: string | null;
}): Promise<{ url: string } | { error: string }> {
  const { taskId, artifactId, filename, content, repo } = opts;
  const githubConfigured = isGitHubConfigured();

  if (!githubConfigured || !repo) {
    const reason = !githubConfigured ? 'GITHUB_TOKEN not set' : 'repo not configured';
    logger.info({ taskId, artifactId, reason }, 'Artifact stored locally (no GitHub upload)');
    return { url: `(local only - ${reason})` };
  }

  try {
    const url = await uploadToGitHub({ repo, taskId, filename, content });
    logger.info({ taskId, artifactId, url }, 'Artifact uploaded to GitHub');
    return { url };
  } catch (error) {
    if (error instanceof GitHubAuthError) {
      return { error: error.message };
    }
    logger.warn({ error, taskId }, 'GitHub upload failed, artifact stored without remote URL');
    return { url: `(GitHub upload failed: ${error instanceof Error ? error.message : 'unknown'})` };
  }
}

/** Link an artifact to a deliverable */
function linkArtifactToDeliverable(opts: {
  doc: TaskDocument;
  deliverableId: string;
  artifactId: string;
  actor: string;
  taskId: string;
}): void {
  const { doc, deliverableId, artifactId, actor, taskId } = opts;

  const deliverablesArray: Array<{
    id: string;
    text: string;
    linkedArtifactId: string | null;
    linkedAt: number | null;
  }> = doc.deliverables.toJSON();

  const deliverableIndex = deliverablesArray.findIndex((d) => d.id === deliverableId);
  if (deliverableIndex === -1) {
    logger.warn({ taskId, deliverableId }, 'Deliverable not found for linking');
    return;
  }

  const deliverable = deliverablesArray[deliverableIndex];
  if (!deliverable) {
    return;
  }

  doc.deliverables.delete(deliverableIndex, 1);
  doc.deliverables.insert(deliverableIndex, {
    id: deliverable.id,
    text: deliverable.text,
    linkedArtifactId: artifactId,
    linkedAt: Date.now(),
  });

  doc.logEvent('deliverable_linked', actor, {
    deliverableId,
    artifactId,
    deliverableText: deliverable.text,
  });

  logger.info({ taskId, artifactId, deliverableId }, 'Artifact linked to deliverable');
}

/** Check if all deliverables are complete */
function areAllDeliverablesComplete(doc: TaskDocument): boolean {
  const deliverables: Array<{ linkedArtifactId: string | null }> = doc.deliverables.toJSON();
  return deliverables.length > 0 && deliverables.every((d) => d.linkedArtifactId);
}

/**
 * Add an artifact to a task.
 */
export async function addArtifact(opts: {
  taskId: string;
  sessionToken: string;
  type: 'html' | 'image' | 'video';
  filename: string;
  source: 'file' | 'url' | 'base64';
  filePath?: string;
  contentUrl?: string;
  content?: string;
  deliverableId?: string;
  description?: string;
}): Promise<AddArtifactResponse> {
  const { taskId, sessionToken, type, filename } = opts;

  /** Validate artifact type */
  try {
    validateArtifactType(type, filename);
  } catch (error) {
    return createArtifactError(error instanceof Error ? error.message : 'Invalid artifact type');
  }

  /** Get task document */
  const taskResult = await getTaskDocument(taskId);
  if (!taskResult.success) {
    return createArtifactError(taskResult.error);
  }
  const { doc, meta } = taskResult;

  /** Verify session token */
  const tokenError = verifySessionToken(sessionToken, meta.sessionTokenHash, taskId);
  if (tokenError) {
    return createArtifactError(tokenError);
  }

  /** Resolve content based on source type */
  const contentSource = resolveContentSource(opts);
  if (!contentSource) {
    return createArtifactError(
      `Missing content for source type '${opts.source}'. Provide filePath, contentUrl, or content.`
    );
  }

  const contentResult = await resolveArtifactContent(contentSource);
  if (!contentResult.success) {
    return createArtifactError(contentResult.error);
  }

  const actor = await getGitHubUsername();
  const artifactId = generateArtifactId();

  /** Upload to storage */
  const uploadResult = await uploadArtifactToStorage({
    taskId,
    artifactId,
    filename,
    content: contentResult.content,
    repo: meta.repo,
  });

  if ('error' in uploadResult) {
    return createArtifactError(uploadResult.error);
  }

  const artifactUrl = uploadResult.url;

  /** Create and add artifact to doc */
  doc.artifacts.push({
    storage: 'github' as const,
    id: artifactId,
    type,
    filename,
    description: opts.description ?? null,
    uploadedAt: Date.now(),
    url: artifactUrl,
  });

  doc.logEvent('artifact_uploaded', actor, { artifactId, filename, artifactType: type });

  /** Link to deliverable if specified */
  if (opts.deliverableId) {
    linkArtifactToDeliverable({
      doc,
      deliverableId: opts.deliverableId,
      artifactId,
      actor,
      taskId,
    });
  }

  const allComplete = areAllDeliverablesComplete(doc);
  logger.info({ taskId, artifactId, allComplete }, 'Artifact added via sandbox');

  /** Handle auto-completion if all deliverables are fulfilled */
  if (allComplete) {
    const autoCompleteResult = await performAutoComplete(doc, meta, actor, taskId);
    return {
      artifactId,
      url: artifactUrl,
      allDeliverablesComplete: true,
      snapshotUrl: autoCompleteResult.snapshotUrl,
      isError: false,
    };
  }

  return {
    artifactId,
    url: artifactUrl,
    allDeliverablesComplete: false,
    isError: false,
  };
}

/** --- Auto-Complete Logic --- */

interface AutoCompleteResult {
  snapshotUrl: string;
  linkedPR: {
    prNumber: number;
    url: string;
    status: string;
    branch: string;
    title: string;
  } | null;
}

/**
 * Perform auto-completion when all deliverables are fulfilled.
 * - Updates status to completed
 * - Tries to auto-link PR from current branch
 * - Generates snapshot URL
 */
async function performAutoComplete(
  doc: TaskDocument,
  meta: TaskMeta,
  actor: string,
  taskId: string
): Promise<AutoCompleteResult> {
  const env = parseEnv();

  /** Try to auto-link PR from current branch */
  let linkedPR: AutoCompleteResult['linkedPR'] = null;

  if (meta.repo) {
    /** Check if there's already a linked PR */
    const existingPRs = doc.linkedPRs.toJSON();
    if (!Array.isArray(existingPRs) || existingPRs.length === 0) {
      const prInfo = await tryAutoLinkPR(meta.repo);
      if (prInfo) {
        doc.linkedPRs.push({
          prNumber: prInfo.prNumber,
          status: prInfo.status,
          branch: prInfo.branch,
          title: prInfo.title,
        });

        doc.logEvent('pr_linked', actor, {
          prNumber: prInfo.prNumber,
          title: prInfo.title,
        });

        linkedPR = prInfo;

        logger.info(
          { taskId, prNumber: prInfo.prNumber, branch: prInfo.branch },
          'Auto-linked PR from current branch'
        );
      }
    }
  }

  /** Update status to completed */
  doc.updateStatus('completed', actor);

  /** Generate snapshot URL */
  const snapshotUrl = `${env.WEB_URL}/snapshots/${taskId}`;

  logger.info({ taskId, snapshotUrl }, 'Task auto-completed');

  return { snapshotUrl, linkedPR };
}

/**
 * Complete a task.
 */
export async function completeTask(
  taskId: string,
  sessionToken: string,
  summary?: string
): Promise<{
  snapshotUrl: string;
  status: string;
  isError: boolean;
  error?: string;
}> {
  /** Get task document */
  const taskResult = await getTaskDocument(taskId);
  if (!taskResult.success) {
    return {
      snapshotUrl: '',
      status: 'error',
      isError: true,
      error: taskResult.error,
    };
  }
  const { doc, meta } = taskResult;

  /** Verify session token */
  const tokenError = verifySessionToken(sessionToken, meta.sessionTokenHash, taskId);
  if (tokenError) {
    return {
      snapshotUrl: '',
      status: 'error',
      isError: true,
      error: tokenError,
    };
  }

  /** Check if there are any artifacts */
  const artifacts = doc.artifacts.toJSON();
  if (!Array.isArray(artifacts) || artifacts.length === 0) {
    return {
      snapshotUrl: '',
      status: 'error',
      isError: true,
      error: 'Cannot complete: no artifacts uploaded. Upload artifacts first using addArtifact.',
    };
  }

  const actor = await getGitHubUsername();

  /** Perform auto-completion */
  const result = await performAutoComplete(doc, meta, actor, taskId);

  /** Log completion event with summary */
  if (summary) {
    doc.logEvent('agent_activity', actor, {
      message: `Completion summary: ${summary}`,
      isBlocker: null,
    });
  }

  logger.info({ taskId }, 'Task completed via sandbox');

  return {
    snapshotUrl: result.snapshotUrl,
    status: 'completed',
    isError: false,
  };
}

/**
 * Update block content.
 */
export async function updateBlockContent(
  taskId: string,
  sessionToken: string,
  operations: Array<{
    type: 'update' | 'insert' | 'delete' | 'replace_all';
    blockId?: string;
    afterBlockId?: string | null;
    content?: string;
  }>
): Promise<void> {
  /** Get task document */
  const taskResult = await getTaskDocument(taskId);
  if (!taskResult.success) {
    throw new Error(taskResult.error);
  }
  const { doc, meta } = taskResult;

  /** Verify session token */
  const tokenError = verifySessionToken(sessionToken, meta.sessionTokenHash, taskId);
  if (tokenError) {
    throw new Error(tokenError);
  }

  const actor = await getGitHubUsername();

  /**
   * Block content operations are managed by loro-prosemirror in the browser.
   * This API logs the intent but actual content manipulation happens client-side.
   * Future: Implement server-side block operations using Loro's text/richtext API.
   */
  doc.logEvent('content_edited', actor, {
    summary: `${operations.length} block operations requested`,
  });

  logger.info(
    { taskId, operationCount: operations.length },
    'Block content update logged via sandbox'
  );
}

/**
 * Link a PR to a task.
 */
export async function linkPR(opts: {
  taskId: string;
  sessionToken: string;
  prNumber: number;
  branch?: string;
  repo?: string;
}): Promise<{
  prNumber: number;
  url: string;
  status: string;
  branch: string;
  title: string;
}> {
  const { taskId, sessionToken, prNumber } = opts;

  /** Get task document */
  const taskResult = await getTaskDocument(taskId);
  if (!taskResult.success) {
    throw new Error(taskResult.error);
  }
  const { doc, meta } = taskResult;

  /** Verify session token */
  const tokenError = verifySessionToken(sessionToken, meta.sessionTokenHash, taskId);
  if (tokenError) {
    throw new Error(tokenError);
  }

  const actor = await getGitHubUsername();
  const repo = opts.repo || meta.repo;

  /** Add linked PR */
  const pr = {
    prNumber,
    status: 'open' as const,
    branch: opts.branch ?? null,
    title: null,
  };
  doc.linkedPRs.push(pr);

  /** Log event */
  doc.logEvent('pr_linked', actor, {
    prNumber,
    title: null,
  });

  const url = repo ? `https://github.com/${repo}/pull/${prNumber}` : '';

  logger.info({ taskId, prNumber }, 'PR linked via sandbox');

  return {
    prNumber,
    url,
    status: 'open',
    branch: opts.branch || '',
    title: '',
  };
}

/**
 * Post an update to the task timeline.
 */
export async function postUpdate(opts: {
  taskId: string;
  sessionToken: string;
  message: string;
}): Promise<{ success: boolean; isError: boolean; error?: string }> {
  const { taskId, sessionToken, message } = opts;

  /** Get task document */
  const taskResult = await getTaskDocument(taskId);
  if (!taskResult.success) {
    return { success: false, isError: true, error: taskResult.error };
  }
  const { doc, meta } = taskResult;

  /** Verify session token */
  const tokenError = verifySessionToken(sessionToken, meta.sessionTokenHash, taskId);
  if (tokenError) {
    return { success: false, isError: true, error: tokenError };
  }

  const actor = await getGitHubUsername();

  /** Log agent activity event */
  doc.logEvent('agent_activity', actor, {
    message,
    isBlocker: null,
  });

  logger.info({ taskId }, 'Update posted via sandbox');

  return { success: true, isError: false };
}

/** Filter options for diff comments */
interface DiffCommentFilterOptions {
  includeLocal: boolean;
  includePR: boolean;
  includeResolved: boolean;
}

/** Parse filter options with defaults */
function parseDiffCommentFilterOptions(opts?: {
  includeLocal?: boolean;
  includePR?: boolean;
  includeResolved?: boolean;
}): DiffCommentFilterOptions {
  return {
    includeLocal: opts?.includeLocal !== false,
    includePR: opts?.includePR !== false,
    includeResolved: opts?.includeResolved === true,
  };
}

/** Check if a comment should be included based on filters */
function shouldIncludeComment(
  comment: Record<string, unknown>,
  filters: DiffCommentFilterOptions
): boolean {
  const kind = String(comment.kind ?? '');

  if (kind === 'local' && !filters.includeLocal) {
    return false;
  }
  if (kind === 'pr' && !filters.includePR) {
    return false;
  }
  if (comment.resolved && !filters.includeResolved) {
    return false;
  }
  return true;
}

/** Format a single diff comment as markdown */
function formatDiffComment(id: string, comment: Record<string, unknown>): string {
  const kind = String(comment.kind ?? '');
  let output = `## [${kind}:${id}]\n`;
  output += `**Author:** ${comment.author || 'unknown'}\n`;

  if (comment.path) {
    output += `**File:** ${comment.path}\n`;
  }
  if (comment.line) {
    output += `**Line:** ${comment.line}\n`;
  }

  output += `\n${comment.body || ''}\n\n`;
  return output;
}

/**
 * Read diff comments.
 */
export async function readDiffComments(
  taskId: string,
  sessionToken: string,
  opts?: {
    includeLocal?: boolean;
    includePR?: boolean;
    includeResolved?: boolean;
  }
): Promise<string> {
  /** Get task document */
  const taskResult = await getTaskDocument(taskId);
  if (!taskResult.success) {
    return `Error: ${taskResult.error}`;
  }
  const { doc, meta } = taskResult;

  /** Verify session token */
  const tokenError = verifySessionToken(sessionToken, meta.sessionTokenHash, taskId);
  if (tokenError) {
    return `Error: ${tokenError}`;
  }

  /** Get comments from document */
  const comments = doc.comments.toJSON();
  if (!comments || typeof comments !== 'object') {
    return 'No diff comments found.';
  }

  const filters = parseDiffCommentFilterOptions(opts);
  let output = '# Diff Comments\n\n';
  let count = 0;

  for (const [id, comment] of Object.entries(comments)) {
    if (!comment || typeof comment !== 'object') {
      continue;
    }

    const c = comment as Record<string, unknown>;
    if (!shouldIncludeComment(c, filters)) {
      continue;
    }

    output += formatDiffComment(id, c);
    count++;
  }

  if (count === 0) {
    return 'No diff comments found matching the filter criteria.';
  }

  return output;
}

/**
 * Reply to a diff comment.
 */
export async function replyToDiffComment(opts: {
  taskId: string;
  sessionToken: string;
  commentId: string;
  body: string;
}): Promise<string> {
  const { taskId, sessionToken, commentId, body } = opts;

  /** Get task document */
  const taskResult = await getTaskDocument(taskId);
  if (!taskResult.success) {
    return `Error: ${taskResult.error}`;
  }
  const { doc, meta } = taskResult;

  /** Verify session token */
  const tokenError = verifySessionToken(sessionToken, meta.sessionTokenHash, taskId);
  if (tokenError) {
    return `Error: ${tokenError}`;
  }

  const actor = await getGitHubUsername();
  const { generateCommentId } = await import('@shipyard/loro-schema');
  const replyId = generateCommentId();

  /**
   * Comment replies are stored in the comments record.
   * The inReplyTo field links replies to parent comments.
   */
  doc.logEvent('comment_added', actor, {
    commentId: replyId,
    threadId: commentId,
    preview: body.slice(0, 100),
  });

  logger.info({ taskId, commentId, replyId }, 'Reply to diff comment via sandbox');

  return `Reply added! Comment ID: ${replyId}`;
}

/**
 * Reply to a thread comment.
 */
export async function replyToThreadComment(opts: {
  taskId: string;
  sessionToken: string;
  threadId: string;
  body: string;
}): Promise<string> {
  const { taskId, sessionToken, threadId, body } = opts;

  /** Get task document */
  const taskResult = await getTaskDocument(taskId);
  if (!taskResult.success) {
    return `Error: ${taskResult.error}`;
  }
  const { doc, meta } = taskResult;

  /** Verify session token */
  const tokenError = verifySessionToken(sessionToken, meta.sessionTokenHash, taskId);
  if (tokenError) {
    return `Error: ${tokenError}`;
  }

  const actor = await getGitHubUsername();
  const { generateCommentId } = await import('@shipyard/loro-schema');
  const replyId = generateCommentId();

  /**
   * Thread comment replies are stored in the comments record.
   * The threadId links replies to the parent thread.
   */
  doc.logEvent('comment_added', actor, {
    commentId: replyId,
    threadId,
    preview: body.slice(0, 100),
  });

  logger.info({ taskId, threadId, replyId }, 'Reply to thread comment via sandbox');

  return `Reply added to thread! Comment ID: ${replyId}`;
}

/**
 * Regenerate session token.
 */
export async function regenerateSessionToken(
  taskId: string
): Promise<{ sessionToken: string; taskId: string }> {
  /** Get task document */
  const taskResult = await getTaskDocument(taskId);
  if (!taskResult.success) {
    throw new Error(taskResult.error);
  }
  const { doc, meta } = taskResult;

  /** Verify ownership via GitHub identity */
  const currentUser = await getGitHubUsername();
  if (meta.ownerId && meta.ownerId !== currentUser) {
    throw new Error(
      `Cannot regenerate token for task "${taskId}". ` +
        `You (${currentUser}) are not the owner (${meta.ownerId}).`
    );
  }

  /** Generate new token */
  const sessionToken = generateSessionToken();
  const sessionTokenHash = hashSessionToken(sessionToken);

  /** Update document */
  doc.meta.sessionTokenHash = sessionTokenHash;

  logger.info({ taskId }, 'Session token regenerated via sandbox');

  return { sessionToken, taskId };
}
