import type { Block } from '@blocknote/core';
import { ServerBlockNoteEditor } from '@blocknote/server-util';
import {
  getPlanMetadata,
  PLAN_INDEX_DOC_NAME,
  setPlanMetadata,
  touchPlanIndexEntry,
} from '@peer-plan/schema';
import { z } from 'zod';
import { logger } from '../logger.js';
import { verifySessionToken } from '../session-token.js';
import { getOrCreateDoc } from '../ws-server.js';
import { TOOL_NAMES } from './tool-names.js';

// --- Input Schema ---

const BlockOperationSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('update'),
    blockId: z.string().describe('The block ID to update (from read_plan output)'),
    content: z.string().describe('New markdown content for this block'),
  }),
  z.object({
    type: z.literal('insert'),
    afterBlockId: z
      .string()
      .nullable()
      .describe('Insert after this block ID (null = insert at beginning)'),
    content: z.string().describe('Markdown content to insert as new block(s)'),
  }),
  z.object({
    type: z.literal('delete'),
    blockId: z.string().describe('The block ID to delete'),
  }),
  z.object({
    type: z.literal('replace_all'),
    content: z.string().describe('Complete markdown content to replace the entire plan'),
  }),
]);

const UpdateBlockContentInput = z.object({
  planId: z.string().describe('The plan ID to modify'),
  sessionToken: z.string().describe('Session token from create_plan'),
  operations: z
    .array(BlockOperationSchema)
    .min(1)
    .describe('Array of operations to perform atomically'),
});

type BlockOperation = z.infer<typeof BlockOperationSchema>;

// --- Public Export ---

export const updateBlockContentTool = {
  definition: {
    name: TOOL_NAMES.UPDATE_BLOCK_CONTENT,
    description: `Modify plan content by updating, inserting, or deleting specific blocks. Use read_plan first to get block IDs.

DELIVERABLES: When inserting/updating content, you can mark checkbox items as deliverables using {#deliverable} marker. These can later be linked to artifacts via add_artifact tool.

Operations:
- update: Replace an existing block with new markdown content
- insert: Add new blocks after a specific block (or at beginning if afterBlockId is null)
- delete: Remove a specific block
- replace_all: Replace entire plan content with new markdown

Example with deliverables:
{ "type": "insert", "afterBlockId": "block-123", "content": "- [ ] Screenshot of feature {#deliverable}" }`,
    inputSchema: {
      type: 'object',
      properties: {
        planId: { type: 'string', description: 'The plan ID to modify' },
        sessionToken: { type: 'string', description: 'Session token from create_plan' },
        operations: {
          type: 'array',
          description: 'Array of operations to perform atomically',
          items: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: ['update', 'insert', 'delete', 'replace_all'],
                description: 'Operation type',
              },
              blockId: {
                type: 'string',
                description: 'Block ID for update/delete operations (from read_plan output)',
              },
              afterBlockId: {
                type: 'string',
                nullable: true,
                description: 'Insert after this block ID (null = beginning)',
              },
              content: {
                type: 'string',
                description:
                  'Markdown content for update/insert/replace_all. Can include {#deliverable} markers on checkbox items.',
              },
            },
            required: ['type'],
          },
        },
      },
      required: ['planId', 'sessionToken', 'operations'],
    },
  },

  handler: async (args: unknown) => {
    const input = UpdateBlockContentInput.parse(args);
    const { planId, sessionToken, operations } = input;

    logger.info({ planId, operationCount: operations.length }, 'Updating block content');

    const ydoc = await getOrCreateDoc(planId);

    // Verify session token first
    const metadata = getPlanMetadata(ydoc);
    if (!metadata) {
      return {
        content: [{ type: 'text', text: `Plan "${planId}" not found.` }],
        isError: true,
      };
    }

    if (
      !metadata.sessionTokenHash ||
      !verifySessionToken(sessionToken, metadata.sessionTokenHash)
    ) {
      return {
        content: [{ type: 'text', text: `Invalid session token for plan "${planId}".` }],
        isError: true,
      };
    }

    const editor = ServerBlockNoteEditor.create();

    // Get current blocks from document fragment
    const fragment = ydoc.getXmlFragment('document');
    let blocks: Block[] = editor.yXmlFragmentToBlocks(fragment);

    if (blocks.length === 0 && !operations.some((op) => op.type === 'replace_all')) {
      return {
        content: [
          {
            type: 'text',
            text: `Plan "${planId}" has no content. Use replace_all to add content or create a new plan.`,
          },
        ],
        isError: true,
      };
    }

    // Apply each operation
    const results: string[] = [];
    for (const operation of operations) {
      const result = await applyOperation(blocks, operation, editor);
      if (result.error) {
        return {
          content: [{ type: 'text', text: result.error }],
          isError: true,
        };
      }
      blocks = result.blocks;
      results.push(result.message);
    }

    // Write updated blocks back to document fragment
    ydoc.transact(() => {
      // Clear existing content
      while (fragment.length > 0) {
        fragment.delete(0, 1);
      }
      // Write new blocks
      editor.blocksToYXmlFragment(blocks, fragment);

      // Update metadata timestamp
      setPlanMetadata(ydoc, { updatedAt: Date.now() });
    });

    // Update plan index
    const indexDoc = await getOrCreateDoc(PLAN_INDEX_DOC_NAME);
    touchPlanIndexEntry(indexDoc, planId);

    logger.info({ planId, results }, 'Block content updated successfully');

    return {
      content: [
        {
          type: 'text',
          text: `Updated plan "${planId}":\n${results.map((r) => `- ${r}`).join('\n')}`,
        },
      ],
    };
  },
};

// --- Private Helpers ---

interface OperationResult {
  blocks: Block[];
  message: string;
  error?: string;
}

function findBlockIndex(blocks: Block[], blockId: string): number {
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (block && block.id === blockId) {
      return i;
    }
  }
  return -1;
}

function formatBlockIds(blocks: Block[]): string {
  return blocks.map((b) => b.id).join(', ');
}

function buildArrayWithReplacement(blocks: Block[], index: number, replacements: Block[]): Block[] {
  const result: Block[] = [];
  for (let i = 0; i < blocks.length; i++) {
    if (i === index) {
      for (const r of replacements) result.push(r);
    } else {
      const block = blocks[i];
      if (block) result.push(block);
    }
  }
  return result;
}

function buildArrayWithInsertion(
  blocks: Block[],
  insertIndex: number,
  newBlocks: Block[]
): Block[] {
  const result: Block[] = [];
  for (let i = 0; i < blocks.length; i++) {
    if (i === insertIndex) {
      for (const n of newBlocks) result.push(n);
    }
    const block = blocks[i];
    if (block) result.push(block);
  }
  if (insertIndex >= blocks.length) {
    for (const n of newBlocks) result.push(n);
  }
  return result;
}

function buildArrayWithDeletion(blocks: Block[], deleteIndex: number): Block[] {
  const result: Block[] = [];
  for (let i = 0; i < blocks.length; i++) {
    if (i !== deleteIndex) {
      const block = blocks[i];
      if (block) result.push(block);
    }
  }
  return result;
}

async function applyUpdateOperation(
  blocks: Block[],
  blockId: string,
  content: string,
  editor: ServerBlockNoteEditor
): Promise<OperationResult> {
  const blockIndex = findBlockIndex(blocks, blockId);
  if (blockIndex === -1) {
    return {
      blocks,
      message: '',
      error: `Block "${blockId}" not found. Available IDs: ${formatBlockIds(blocks)}`,
    };
  }

  const newBlocks = await editor.tryParseMarkdownToBlocks(content);
  if (newBlocks.length === 0) {
    return { blocks, message: '', error: `Could not parse content for block "${blockId}"` };
  }

  if (newBlocks.length === 1 && newBlocks[0]) {
    newBlocks[0].id = blockId;
  }

  return {
    blocks: buildArrayWithReplacement(blocks, blockIndex, newBlocks),
    message: `Updated block ${blockId}`,
  };
}

async function applyInsertOperation(
  blocks: Block[],
  afterBlockId: string | null,
  content: string,
  editor: ServerBlockNoteEditor
): Promise<OperationResult> {
  const newBlocks = await editor.tryParseMarkdownToBlocks(content);
  if (newBlocks.length === 0) {
    return { blocks, message: '', error: 'Could not parse content for insertion' };
  }

  let insertIndex: number;
  if (afterBlockId === null) {
    insertIndex = 0;
  } else {
    const afterIndex = findBlockIndex(blocks, afterBlockId);
    if (afterIndex === -1) {
      return {
        blocks,
        message: '',
        error: `Block "${afterBlockId}" not found. Available IDs: ${formatBlockIds(blocks)}`,
      };
    }
    insertIndex = afterIndex + 1;
  }

  return {
    blocks: buildArrayWithInsertion(blocks, insertIndex, newBlocks),
    message: `Inserted ${newBlocks.length} block(s) after ${afterBlockId ?? 'beginning'}`,
  };
}

function applyDeleteOperation(blocks: Block[], blockId: string): OperationResult {
  const blockIndex = findBlockIndex(blocks, blockId);
  if (blockIndex === -1) {
    return {
      blocks,
      message: '',
      error: `Block "${blockId}" not found. Available IDs: ${formatBlockIds(blocks)}`,
    };
  }
  return {
    blocks: buildArrayWithDeletion(blocks, blockIndex),
    message: `Deleted block ${blockId}`,
  };
}

async function applyReplaceAllOperation(
  content: string,
  editor: ServerBlockNoteEditor
): Promise<OperationResult> {
  const newBlocks = await editor.tryParseMarkdownToBlocks(content);
  return { blocks: newBlocks, message: `Replaced all content with ${newBlocks.length} block(s)` };
}

async function applyOperation(
  blocks: Block[],
  operation: BlockOperation,
  editor: ServerBlockNoteEditor
): Promise<OperationResult> {
  switch (operation.type) {
    case 'update':
      return applyUpdateOperation(blocks, operation.blockId, operation.content, editor);
    case 'insert':
      return applyInsertOperation(blocks, operation.afterBlockId, operation.content, editor);
    case 'delete':
      return applyDeleteOperation(blocks, operation.blockId);
    case 'replace_all':
      return applyReplaceAllOperation(operation.content, editor);
    default: {
      const _exhaustive: never = operation;
      return {
        blocks,
        message: '',
        error: `Unknown operation type: ${JSON.stringify(_exhaustive)}`,
      };
    }
  }
}
