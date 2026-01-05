import type { Block } from '@blocknote/core';
import { ServerBlockNoteEditor } from '@blocknote/server-util';
import { initPlanMetadata, PLAN_INDEX_DOC_NAME, setPlanIndexEntry } from '@peer-plan/schema';
import { nanoid } from 'nanoid';
import open from 'open';
import { z } from 'zod';
import { logger } from '../logger.js';
import { getOrCreateDoc } from '../ws-server.js';
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
    description: 'Create a new implementation plan and open it in browser',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Plan title' },
        content: { type: 'string', description: 'Plan content (markdown)' },
        repo: { type: 'string', description: 'GitHub repo (org/repo)' },
        prNumber: { type: 'number', description: 'PR number' },
      },
      required: ['title', 'content'],
    },
  },

  handler: async (args: unknown) => {
    const input = CreatePlanInput.parse(args);
    const planId = nanoid();
    const now = Date.now();

    logger.info({ planId, title: input.title }, 'Creating plan');

    const ydoc = await getOrCreateDoc(planId);
    initPlanMetadata(ydoc, {
      id: planId,
      title: input.title,
      status: 'draft',
      repo: input.repo,
      pr: input.prNumber,
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
    });

    logger.info('Content stored in Y.Doc document fragment');

    const indexDoc = await getOrCreateDoc(PLAN_INDEX_DOC_NAME);
    setPlanIndexEntry(indexDoc, {
      id: planId,
      title: input.title,
      status: 'draft',
      createdAt: now,
      updatedAt: now,
    });

    logger.info({ planId }, 'Plan index updated');

    // Open the live plan page (not a snapshot URL) so the browser connects via WebSocket
    const url = `http://localhost:5173/plan/${planId}`;

    await open(url);
    logger.info({ url }, 'Browser launched');

    return {
      content: [
        {
          type: 'text',
          text: `Plan created!
ID: ${planId}
URL: ${url}

Use \`${TOOL_NAMES.SETUP_REVIEW_NOTIFICATION}\` tool to be notified when review completes.`,
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
