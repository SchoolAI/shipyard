import type { Block } from '@blocknote/core';
import { createPlanUrl, initPlanMetadata, type UrlEncodedPlan } from '@peer-plan/schema';
import { nanoid } from 'nanoid';
import open from 'open';
import * as Y from 'yjs';
import { z } from 'zod';
import { logger } from '../logger.js';

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

    logger.info({ planId, title: input.title }, 'Creating plan');

    const ydoc = new Y.Doc();
    initPlanMetadata(ydoc, {
      id: planId,
      title: input.title,
      status: 'draft',
      repo: input.repo,
      pr: input.prNumber,
    });

    const blocks = parseMarkdownToBlocks(input.content);

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
