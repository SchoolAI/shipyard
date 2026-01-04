import type { Block } from '@blocknote/core';
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

const CreatePlanInput = z.object({
  title: z.string().describe('Plan title'),
  content: z.string().describe('Plan content (markdown)'),
  repo: z.string().optional().describe('GitHub repo (org/repo)'),
  prNumber: z.number().optional().describe('PR number'),
});

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

    // Get or create the plan Y.Doc (persisted to LevelDB)
    const ydoc = await getOrCreateDoc(planId);
    initPlanMetadata(ydoc, {
      id: planId,
      title: input.title,
      status: 'draft',
      repo: input.repo,
      pr: input.prNumber,
    });

    // Store content in the Y.Doc
    const blocks = parseMarkdownToBlocks(input.content);
    const contentArray = ydoc.getArray('content');
    contentArray.delete(0, contentArray.length); // Clear existing
    contentArray.push(blocks);

    // Update the plan index (syncs to connected browsers)
    const indexDoc = await getOrCreateDoc(PLAN_INDEX_DOC_NAME);
    setPlanIndexEntry(indexDoc, {
      id: planId,
      title: input.title,
      status: 'draft',
      createdAt: now,
      updatedAt: now,
    });

    logger.info({ planId }, 'Plan index updated');

    // Create URL for sharing/opening
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

function parseMarkdownToBlocks(markdown: string): Block[] {
  const lines = markdown.split('\n').filter(Boolean);
  return lines.map((line, i) => ({
    id: `block-${i}`,
    type: 'paragraph',
    props: { textColor: 'default', backgroundColor: 'default', textAlignment: 'left' },
    content: [{ type: 'text', text: line, styles: {} }],
    children: [],
  })) as Block[];
}
