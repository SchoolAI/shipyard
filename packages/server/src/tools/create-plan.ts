import type { Block } from '@blocknote/core';
import { ServerBlockNoteEditor } from '@blocknote/server-util';
import {
  createPlanUrl,
  initPlanMetadata,
  PLAN_INDEX_DOC_NAME,
  setPlanIndexEntry,
  type UrlEncodedPlan,
} from '@peer-plan/schema';
import { nanoid } from 'nanoid';
import open from 'open';
import { z } from 'zod';
import { logger } from '../logger.js';
import { getOrCreateDoc } from '../ws-server.js';

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
    name: 'create_plan',
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

    // NOTE: We store blocks in both places:
    // 1. 'content' Y.Array for JSON serialization (URL snapshots, read_plan tool)
    // 2. 'document' Y.XmlFragment for BlockNote collaboration
    logger.info({ contentLength: input.content.length }, 'About to parse markdown');
    const blocks = await parseMarkdownToBlocks(input.content);
    logger.info({ blockCount: blocks.length }, 'Parsed blocks, storing in Y.Doc');

    const editor = ServerBlockNoteEditor.create();

    ydoc.transact(() => {
      const contentArray = ydoc.getArray('content');
      contentArray.delete(0, contentArray.length);
      contentArray.push(blocks);

      const fragment = ydoc.getXmlFragment('document');
      editor.blocksToYXmlFragment(blocks, fragment);
    });

    logger.info('Content stored in Y.Doc (both content array and document fragment)');

    const indexDoc = await getOrCreateDoc(PLAN_INDEX_DOC_NAME);
    setPlanIndexEntry(indexDoc, {
      id: planId,
      title: input.title,
      status: 'draft',
      createdAt: now,
      updatedAt: now,
    });

    logger.info({ planId }, 'Plan index updated');

    const baseUrl = 'http://localhost:5173/plan';
    const urlPlan: UrlEncodedPlan = {
      v: 1,
      id: planId,
      title: input.title,
      status: 'draft',
      repo: input.repo,
      pr: input.prNumber,
      content: blocks,
    };

    const url = createPlanUrl(baseUrl, urlPlan);

    await open(url);
    logger.info({ url }, 'Browser launched');

    return {
      content: [
        {
          type: 'text',
          text: `Plan created!\nID: ${planId}\nURL: ${url}`,
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
