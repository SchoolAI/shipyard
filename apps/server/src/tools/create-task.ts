import type { Block } from '@blocknote/core';
import { ServerBlockNoteEditor } from '@blocknote/server-util';
import {
  addDeliverable,
  createPlanWebUrl,
  extractDeliverables,
  getPlanMetadata,
  initPlanMetadata,
  logPlanEvent,
  type OriginMetadata,
  PLAN_INDEX_DOC_NAME,
  setPlanIndexEntry,
  transitionPlanStatus,
  YDOC_KEYS,
} from '@shipyard/schema';
import { nanoid } from 'nanoid';
import open from 'open';
import type * as Y from 'yjs';
import { z } from 'zod';
import { webConfig } from '../config/env/web.js';
import { getOrCreateDoc, hasActiveConnections } from '../doc-store.js';
import { logger } from '../logger.js';
import { getGitHubUsername, getRepositoryFullName } from '../server-identity.js';
import { generateSessionToken, hashSessionToken } from '../session-token.js';
import { TOOL_NAMES } from './tool-names.js';

/**
 * Origin platforms for conversation export.
 * Claude Code uses hook, so only other platforms are listed here.
 */
const OriginPlatformEnum = z.enum(['devin', 'cursor', 'windsurf', 'aider', 'unknown']);

const CreateTaskInput = z.object({
  title: z.string().describe('Task title'),
  content: z.string().describe('Task content (markdown)'),
  repo: z.string().optional().describe('GitHub repo (org/repo)'),
  prNumber: z.number().optional().describe('PR number'),

  originPlatform: OriginPlatformEnum.optional().describe(
    'Platform where this plan originated (for conversation export)'
  ),
  originSessionId: z.string().optional().describe('Platform-specific session ID'),
  originMetadata: z
    .record(z.string(), z.unknown())
    .optional()
    .describe('Platform-specific metadata for conversation export'),

  tags: z
    .array(z.string())
    .optional()
    .describe('Tags for categorization (e.g., ["ui", "bug", "project:mobile-app"])'),
});

/** Construct origin metadata from input platform and session info */
function buildOriginMetadata(
  platform: z.infer<typeof OriginPlatformEnum> | undefined,
  sessionId: string | undefined,
  metadata: Record<string, unknown> | undefined
): OriginMetadata | undefined {
  if (!platform || !sessionId) {
    return { platform: 'unknown' as const, cwd: process.cwd() };
  }

  switch (platform) {
    case 'devin':
      return { platform: 'devin' as const, sessionId };
    case 'cursor': {
      const generationId = metadata?.generationId;
      return {
        platform: 'cursor' as const,
        conversationId: sessionId,
        generationId: typeof generationId === 'string' ? generationId : undefined,
      };
    }
    case 'windsurf':
    case 'aider':
    case 'unknown':
      return { platform: 'unknown' as const, cwd: process.cwd() };
    default: {
      const _exhaustive: never = platform;
      void _exhaustive;
      return { platform: 'unknown' as const, cwd: process.cwd() };
    }
  }
}

/** Initialize task document content with blocks and deliverables */
function initializeTaskContent(ydoc: Y.Doc, blocks: Block[], ownerId: string | null): void {
  const editor = ServerBlockNoteEditor.create();

  ydoc.transact(
    () => {
      const fragment = ydoc.getXmlFragment('document');
      while (fragment.length > 0) {
        fragment.delete(0, 1);
      }
      editor.blocksToYXmlFragment(blocks, fragment);

      const deliverablesArray = ydoc.getArray(YDOC_KEYS.DELIVERABLES);
      deliverablesArray.delete(0, deliverablesArray.length);

      const deliverables = extractDeliverables(blocks);
      for (const deliverable of deliverables) {
        addDeliverable(ydoc, deliverable);
      }

      if (deliverables.length > 0) {
        logger.info({ count: deliverables.length }, 'Deliverables extracted and stored');
      }

      logPlanEvent(ydoc, 'plan_created', ownerId ?? 'unknown');
    },
    { actor: ownerId ?? 'unknown' }
  );
}

/** Open or navigate to task URL */
async function openTaskInBrowser(taskId: string, url: string): Promise<void> {
  const indexDoc = await getOrCreateDoc(PLAN_INDEX_DOC_NAME);

  if (await hasActiveConnections(PLAN_INDEX_DOC_NAME)) {
    indexDoc.getMap<string>('navigation').set('target', taskId);
    logger.info({ url, taskId }, 'Browser already connected, navigating via CRDT');
  } else {
    await open(url);
    logger.info({ url }, 'Browser launched');
  }
}

export const createTaskTool = {
  definition: {
    name: TOOL_NAMES.CREATE_TASK,
    description: `Create a new implementation task and open it in browser.

NOTE FOR CLAUDE CODE USERS: If you have the shipyard hook installed, use native plan mode (Shift+Tab) instead of this tool. The hook handles task creation automatically and provides a better experience.

This tool is for agents WITHOUT hook support (Cursor, Devin, etc).

DELIVERABLES: Mark checkbox items as deliverables using {#deliverable} marker. Deliverables are measurable outcomes you can prove with artifacts.

Good deliverables (provable with artifacts):
- [ ] Screenshot of working feature {#deliverable}
- [ ] Video demo of user flow {#deliverable}
- [ ] Test results showing all tests pass {#deliverable}

Bad deliverables (not provable):
- [ ] Implement the API  ← This is a task, not a deliverable
- [ ] Add error handling ← Can't prove this with an artifact`,
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Task title' },
        content: {
          type: 'string',
          description:
            'Task content in markdown. Use {#deliverable} marker on checkbox items to mark them as deliverables that can be linked to artifacts.',
        },
        repo: {
          type: 'string',
          description:
            'GitHub repo (org/repo). Auto-detected from current directory if not provided. Required for artifact uploads.',
        },
        prNumber: { type: 'number', description: 'PR number. Required for artifact uploads.' },
        originPlatform: {
          type: 'string',
          enum: ['devin', 'cursor', 'windsurf', 'aider', 'unknown'],
          description: 'Platform where this plan originated. Used for conversation export/import.',
        },
        originSessionId: {
          type: 'string',
          description:
            'Platform-specific session ID. Include this so conversation history can be exported later.',
        },
        originMetadata: {
          type: 'object',
          description: 'Platform-specific metadata for conversation export.',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Tags for categorization (e.g., ["ui", "bug", "project:mobile-app"]). Use conventions like "project:name" for grouping.',
        },
      },
      required: ['title', 'content'],
    },
  },

  handler: async (args: unknown) => {
    const input = CreateTaskInput.parse(args);
    const taskId = nanoid();
    const sessionToken = generateSessionToken();
    const sessionTokenHash = hashSessionToken(sessionToken);
    const now = Date.now();

    const repo = input.repo || getRepositoryFullName() || undefined;
    if (repo && !input.repo) {
      logger.info({ repo }, 'Auto-detected repository from current directory');
    }

    logger.info({ taskId, title: input.title, repo }, 'Creating task');

    const ydoc = await getOrCreateDoc(taskId);
    const ownerId = await getGitHubUsername();
    logger.info({ ownerId }, 'GitHub username for task ownership');

    const origin = buildOriginMetadata(
      input.originPlatform,
      input.originSessionId,
      input.originMetadata
    );

    initPlanMetadata(ydoc, {
      id: taskId,
      title: input.title,
      repo,
      pr: input.prNumber,
      ownerId,
      sessionTokenHash,
      origin,
      tags: input.tags,
    });

    const transitionResult = transitionPlanStatus(
      ydoc,
      { status: 'pending_review', reviewRequestId: nanoid() },
      ownerId ?? 'unknown'
    );

    if (!transitionResult.success) {
      logger.error(
        { error: transitionResult.error },
        'Failed to transition task to pending_review'
      );
    }

    logger.info({ contentLength: input.content.length }, 'About to parse markdown');
    const blocks = await parseMarkdownToBlocks(input.content);
    logger.info({ blockCount: blocks.length }, 'Parsed blocks, storing in Y.Doc');
    initializeTaskContent(ydoc, blocks, ownerId);
    logger.info('Content stored in Y.Doc document fragment');

    const finalMetadata = getPlanMetadata(ydoc);
    if (!finalMetadata) {
      throw new Error('Failed to get task metadata after initialization');
    }

    const indexDoc = await getOrCreateDoc(PLAN_INDEX_DOC_NAME);
    setPlanIndexEntry(indexDoc, {
      id: taskId,
      title: input.title,
      status: 'pending_review',
      createdAt: now,
      updatedAt: finalMetadata.updatedAt,
      ownerId,
      tags: input.tags,
      deleted: false,
    });
    logger.info({ taskId }, 'Task index updated');

    const url = createPlanWebUrl(webConfig.SHIPYARD_WEB_URL, taskId);
    await openTaskInBrowser(taskId, url);

    const repoInfo = repo
      ? `Repo: ${repo}${!input.repo ? ' (auto-detected)' : ''}`
      : 'Repo: Not set (provide repo and prNumber for artifact uploads)';

    return {
      content: [
        {
          type: 'text',
          text: `Task created!
ID: ${taskId}
Session Token: ${sessionToken}
${repoInfo}
URL: ${url}

IMPORTANT: Save the session token - it's required for add_artifact calls.

Next steps:
1. Wait for human to review and approve the task in the browser
2. Once approved, use add_artifact to upload proof for each deliverable
3. When all deliverables have artifacts, the task auto-completes with a snapshot URL`,
        },
      ],
    };
  },
};

async function parseMarkdownToBlocks(markdown: string): Promise<Block[]> {
  logger.info({ markdown: markdown.substring(0, 100) }, 'Parsing markdown to blocks');

  try {
    const editor = ServerBlockNoteEditor.create();
    const blocks = await editor.tryParseMarkdownToBlocks(markdown);
    logger.info(
      { blockCount: blocks.length, firstBlockType: blocks[0]?.type },
      'Markdown parsed to blocks'
    );

    return blocks;
  } catch (error) {
    logger.error(
      { error, markdown: markdown.substring(0, 100) },
      'Error parsing markdown to blocks'
    );
    throw error;
  }
}
