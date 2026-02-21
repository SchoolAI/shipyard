import type { ContentBlock } from '@shipyard/loro-schema';
import { extractPlanMarkdown } from '@shipyard/loro-schema';
import { assertNever } from './assert-never';

type ToolUseBlock = ContentBlock & { type: 'tool_use' };
type ToolResultBlock = ContentBlock & { type: 'tool_result' };

export interface QuestionOption {
  label: string;
  description: string;
}

export interface ParsedQuestion {
  question: string;
  header: string;
  options: QuestionOption[];
  multiSelect: boolean;
}

function normalizeParsedQuestion(q: Record<string, unknown>): ParsedQuestion {
  return {
    question: typeof q.question === 'string' ? q.question : '',
    header: typeof q.header === 'string' ? q.header : '',
    options: Array.isArray(q.options) ? q.options.filter(isValidOption) : [],
    multiSelect: typeof q.multiSelect === 'boolean' ? q.multiSelect : false,
  };
}

function isValidOption(o: unknown): o is QuestionOption {
  return isRecord(o) && typeof o.label === 'string' && typeof o.description === 'string';
}

export type ParsedQuestions = ParsedQuestion[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function hasQuestionField(q: Record<string, unknown>): boolean {
  return typeof q.question === 'string';
}

function extractQuestions(toolInput: string): ParsedQuestions {
  try {
    const parsed: unknown = JSON.parse(toolInput);
    if (!isRecord(parsed)) return [];
    const questions = parsed.questions;
    if (!Array.isArray(questions)) return [];
    return questions.filter(isRecord).filter(hasQuestionField).map(normalizeParsedQuestion);
  } catch {
    return [];
  }
}

export type GroupedBlock =
  | { kind: 'text'; block: ContentBlock & { type: 'text' } }
  | { kind: 'image'; block: ContentBlock & { type: 'image' } }
  | { kind: 'thinking'; block: ContentBlock & { type: 'thinking' } }
  | {
      kind: 'tool_invocation';
      toolUse: ToolUseBlock;
      toolResult: ToolResultBlock | null;
    }
  | {
      kind: 'subagent_group';
      taskToolUse: ToolUseBlock;
      taskToolResult: ToolResultBlock | null;
      children: GroupedBlock[];
    }
  | {
      kind: 'plan';
      toolUse: ToolUseBlock;
      toolResult: ToolResultBlock | null;
      markdown: string;
    }
  | {
      kind: 'ask_question';
      toolUse: ToolUseBlock;
      toolResult: ToolResultBlock | null;
      questions: ParsedQuestions;
    };

/**
 * Groups flat ContentBlock[] into paired tool invocations and nested subagent groups.
 *
 * Algorithm:
 * 1. Index all tool_result blocks by toolUseId.
 * 2. Bucket blocks with non-null parentToolUseId by their parent.
 * 3. Build the grouped list: Task tool_use blocks with children become subagent_groups
 *    (recursively grouped), others become tool_invocations.
 * 4. Blocks consumed as children are excluded from the top-level list.
 */
export function groupContentBlocks(blocks: ContentBlock[]): GroupedBlock[] {
  return groupBlocksRecursive(blocks);
}

/** Extract parentToolUseId from blocks that carry it, null otherwise. */
function getParentId(block: ContentBlock): string | null {
  if (block.type === 'tool_use' || block.type === 'tool_result') {
    return block.parentToolUseId;
  }
  return null;
}

/** Index all tool_result blocks by their toolUseId. */
function indexResults(blocks: ContentBlock[]): Map<string, ToolResultBlock> {
  const map = new Map<string, ToolResultBlock>();
  for (const block of blocks) {
    if (block.type === 'tool_result') {
      map.set(block.toolUseId, block);
    }
  }
  return map;
}

/** Bucket blocks that have a non-null parentToolUseId by their parent. */
function bucketChildren(blocks: ContentBlock[]): Map<string, ContentBlock[]> {
  const map = new Map<string, ContentBlock[]>();
  for (const block of blocks) {
    const parentId = getParentId(block);
    if (!parentId) continue;
    let bucket = map.get(parentId);
    if (!bucket) {
      bucket = [];
      map.set(parentId, bucket);
    }
    bucket.push(block);
  }
  return map;
}

/** Create an orphan tool_invocation for a tool_result with no matching tool_use. */
function makeOrphanInvocation(block: ToolResultBlock): GroupedBlock {
  return {
    kind: 'tool_invocation',
    toolUse: {
      type: 'tool_use',
      toolUseId: block.toolUseId,
      toolName: 'Unknown',
      input: '{}',
      parentToolUseId: null,
    },
    toolResult: block,
  };
}

/** Group a tool_use block into either a subagent_group or a plain tool_invocation. */
function groupToolUse(
  block: ToolUseBlock,
  resultsByToolUseId: Map<string, ToolResultBlock>,
  childrenByParent: Map<string, ContentBlock[]>,
  consumedResultIds: Set<string>
): GroupedBlock {
  const result = resultsByToolUseId.get(block.toolUseId) ?? null;
  if (result) consumedResultIds.add(block.toolUseId);

  if (block.toolName === 'ExitPlanMode') {
    return {
      kind: 'plan',
      toolUse: block,
      toolResult: result,
      markdown: extractPlanMarkdown(block.input),
    };
  }

  if (block.toolName === 'AskUserQuestion') {
    return {
      kind: 'ask_question',
      toolUse: block,
      toolResult: result,
      questions: extractQuestions(block.input),
    };
  }

  const childBlocks = childrenByParent.get(block.toolUseId);
  if (block.toolName === 'Task' && childBlocks && childBlocks.length > 0) {
    return {
      kind: 'subagent_group',
      taskToolUse: block,
      taskToolResult: result,
      children: groupBlocksRecursive(
        childBlocks.map((b) =>
          b.type === 'tool_use' || b.type === 'tool_result' ? { ...b, parentToolUseId: null } : b
        )
      ),
    };
  }
  return { kind: 'tool_invocation', toolUse: block, toolResult: result };
}

function groupBlocksRecursive(blocks: ContentBlock[]): GroupedBlock[] {
  const resultsByToolUseId = indexResults(blocks);
  const childrenByParent = bucketChildren(blocks);

  const grouped: GroupedBlock[] = [];
  const consumedResultIds = new Set<string>();

  for (const block of blocks) {
    if (getParentId(block)) continue;

    switch (block.type) {
      case 'text':
        grouped.push({ kind: 'text', block });
        break;
      case 'image':
        grouped.push({ kind: 'image', block });
        break;
      case 'thinking':
        grouped.push({ kind: 'thinking', block });
        break;
      case 'tool_use':
        grouped.push(groupToolUse(block, resultsByToolUseId, childrenByParent, consumedResultIds));
        break;
      case 'tool_result':
        if (!consumedResultIds.has(block.toolUseId)) {
          grouped.push(makeOrphanInvocation(block));
        }
        break;
      default:
        assertNever(block);
    }
  }

  return grouped;
}
