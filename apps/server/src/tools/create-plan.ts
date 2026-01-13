import type { Block } from '@blocknote/core';
import { ServerBlockNoteEditor } from '@blocknote/server-util';
import {
  addDeliverable,
  extractDeliverables,
  initPlanMetadata,
  PLAN_INDEX_DOC_NAME,
  setPlanIndexEntry,
} from '@peer-plan/schema';
import { nanoid } from 'nanoid';
import open from 'open';
import { z } from 'zod';
import { logger } from '../logger.js';
import { getGitHubUsername, getRepositoryFullName } from '../server-identity.js';
import { generateSessionToken, hashSessionToken } from '../session-token.js';
import { getOrCreateDoc, hasActiveConnections } from '../ws-server.js';
import { TOOL_NAMES } from './tool-names.js';

// --- Input Schema ---

const CreatePlanInput = z.object({
  title: z.string().describe('Plan title'),
  content: z.string().describe('Plan content (markdown)'),
  repo: z.string().optional().describe('GitHub repo (org/repo)'),
  prNumber: z.number().optional().describe('PR number'),
});

// --- Public Export ---

export const createPlanTool = {
  definition: {
    name: TOOL_NAMES.CREATE_PLAN,
    description: `Create a new implementation plan and open it in browser.

NOTE FOR CLAUDE CODE USERS: If you have the peer-plan hook installed, use native plan mode (Shift+Tab) instead of this tool. The hook handles plan creation automatically and provides a better experience.

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
        title: { type: 'string', description: 'Plan title' },
        content: {
          type: 'string',
          description:
            'Plan content in markdown. Use {#deliverable} marker on checkbox items to mark them as deliverables that can be linked to artifacts.',
        },
        repo: {
          type: 'string',
          description:
            'GitHub repo (org/repo). Auto-detected from current directory if not provided. Required for artifact uploads.',
        },
        prNumber: { type: 'number', description: 'PR number. Required for artifact uploads.' },
      },
      required: ['title', 'content'],
    },
  },

  handler: async (args: unknown) => {
    const input = CreatePlanInput.parse(args);
    const planId = nanoid();
    const sessionToken = generateSessionToken();
    const sessionTokenHash = hashSessionToken(sessionToken);
    const now = Date.now();

    // Auto-detect repo from current directory if not provided
    const repo = input.repo || getRepositoryFullName() || undefined;
    if (repo && !input.repo) {
      logger.info({ repo }, 'Auto-detected repository from current directory');
    }

    logger.info({ planId, title: input.title, repo }, 'Creating plan');

    const ydoc = await getOrCreateDoc(planId);
    const ownerId = getGitHubUsername();
    logger.info({ ownerId }, 'GitHub username for plan ownership');

    initPlanMetadata(ydoc, {
      id: planId,
      title: input.title,
      status: 'draft',
      repo,
      pr: input.prNumber,
      ownerId,
      sessionTokenHash,
    });

    // Parse markdown to blocks and store in Y.XmlFragment for BlockNote collaboration
    logger.info({ contentLength: input.content.length }, 'About to parse markdown');
    const blocks = await parseMarkdownToBlocks(input.content);
    logger.info({ blockCount: blocks.length }, 'Parsed blocks, storing in Y.Doc');

    const editor = ServerBlockNoteEditor.create();

    ydoc.transact(() => {
      // Store in document fragment for BlockNote collaboration (source of truth)
      const fragment = ydoc.getXmlFragment('document');
      // Clear existing content first to avoid duplicates or conflicts
      while (fragment.length > 0) {
        fragment.delete(0, 1);
      }
      editor.blocksToYXmlFragment(blocks, fragment);

      // Extract and store deliverables
      const deliverables = extractDeliverables(blocks);
      for (const deliverable of deliverables) {
        addDeliverable(ydoc, deliverable);
      }

      if (deliverables.length > 0) {
        logger.info({ count: deliverables.length }, 'Deliverables extracted and stored');
      }
    });

    logger.info('Content stored in Y.Doc document fragment');

    const indexDoc = await getOrCreateDoc(PLAN_INDEX_DOC_NAME);
    setPlanIndexEntry(indexDoc, {
      id: planId,
      title: input.title,
      status: 'draft',
      createdAt: now,
      updatedAt: now,
      ownerId,
    });

    logger.info({ planId }, 'Plan index updated');

    const url = `http://localhost:5173/plan/${planId}`;

    if (hasActiveConnections(PLAN_INDEX_DOC_NAME)) {
      indexDoc.getMap('navigation').set('target', planId);
      logger.info({ url, planId }, 'Browser already connected, navigating via CRDT');
    } else {
      await open(url);
      logger.info({ url }, 'Browser launched');
    }

    const repoInfo = repo
      ? `Repo: ${repo}${!input.repo ? ' (auto-detected)' : ''}`
      : 'Repo: Not set (provide repo and prNumber for artifact uploads)';

    return {
      content: [
        {
          type: 'text',
          text: `Plan created!
ID: ${planId}
Session Token: ${sessionToken}
${repoInfo}
URL: ${url}

IMPORTANT: Save the session token - it's required for add_artifact calls.

Next steps:
1. Wait for human to review and approve the plan in the browser
2. Once approved, use add_artifact to upload proof for each deliverable
3. When all deliverables have artifacts, the task auto-completes with a snapshot URL`,
        },
      ],
    };
  },
};

// --- Private Helpers ---

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
