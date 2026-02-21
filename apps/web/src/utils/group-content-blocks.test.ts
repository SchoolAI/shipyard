import type { ContentBlock } from '@shipyard/loro-schema';
import { describe, expect, it } from 'vitest';
import { type GroupedBlock, groupContentBlocks } from './group-content-blocks';

function text(t: string): ContentBlock {
  return { type: 'text', text: t };
}

function thinking(t: string): ContentBlock {
  return { type: 'thinking', text: t };
}

function image(mediaType = 'image/png', data = 'iVBOR...'): ContentBlock {
  return { type: 'image', id: crypto.randomUUID(), source: { type: 'base64', mediaType, data } };
}

function toolUse(
  id: string,
  name: string,
  parentToolUseId: string | null = null
): ContentBlock & { type: 'tool_use' } {
  return { type: 'tool_use', toolUseId: id, toolName: name, input: '{}', parentToolUseId };
}

function toolResult(
  id: string,
  content: string,
  parentToolUseId: string | null = null,
  isError = false
): ContentBlock & { type: 'tool_result' } {
  return { type: 'tool_result', toolUseId: id, content, isError, parentToolUseId };
}

describe('groupContentBlocks', () => {
  it('passes text and thinking blocks through', () => {
    const blocks: ContentBlock[] = [text('hello'), thinking('hmm'), text('world')];
    const grouped = groupContentBlocks(blocks);
    expect(grouped).toHaveLength(3);
    expect(grouped[0]?.kind).toBe('text');
    expect(grouped[1]?.kind).toBe('thinking');
    expect(grouped[2]?.kind).toBe('text');
  });

  it('passes image blocks through as image kind', () => {
    const blocks: ContentBlock[] = [image()];
    const grouped = groupContentBlocks(blocks);
    expect(grouped).toHaveLength(1);
    expect(grouped[0]?.kind).toBe('image');
    const img = grouped[0] as GroupedBlock & { kind: 'image' };
    expect(img.block.source.type).toBe('base64');
  });

  it('handles mixed text and image blocks', () => {
    const blocks: ContentBlock[] = [text('Check this'), image(), text('See above')];
    const grouped = groupContentBlocks(blocks);
    expect(grouped).toHaveLength(3);
    expect(grouped[0]?.kind).toBe('text');
    expect(grouped[1]?.kind).toBe('image');
    expect(grouped[2]?.kind).toBe('text');
  });

  it('pairs tool_use with tool_result by toolUseId', () => {
    const blocks: ContentBlock[] = [toolUse('tu-1', 'Read'), toolResult('tu-1', 'file contents')];
    const grouped = groupContentBlocks(blocks);
    expect(grouped).toHaveLength(1);
    expect(grouped[0]?.kind).toBe('tool_invocation');
    const inv = grouped[0] as GroupedBlock & { kind: 'tool_invocation' };
    expect(inv.toolUse.toolUseId).toBe('tu-1');
    expect(inv.toolResult?.content).toBe('file contents');
  });

  it('renders orphan tool_result as Unknown tool_invocation', () => {
    const blocks: ContentBlock[] = [toolResult('orphan', 'data')];
    const grouped = groupContentBlocks(blocks);
    expect(grouped).toHaveLength(1);
    const inv = grouped[0] as GroupedBlock & { kind: 'tool_invocation' };
    expect(inv.toolUse.toolName).toBe('Unknown');
    expect(inv.toolResult?.content).toBe('data');
  });

  it('nests child tool calls under Task as subagent_group', () => {
    const blocks: ContentBlock[] = [
      toolUse('task-1', 'Task'),
      toolUse('read-1', 'Read', 'task-1'),
      toolResult('read-1', 'file data', 'task-1'),
      toolResult('task-1', 'done'),
    ];
    const grouped = groupContentBlocks(blocks);
    expect(grouped).toHaveLength(1);
    expect(grouped[0]?.kind).toBe('subagent_group');

    const group = grouped[0] as GroupedBlock & { kind: 'subagent_group' };
    expect(group.taskToolUse.toolUseId).toBe('task-1');
    expect(group.taskToolResult?.content).toBe('done');
    expect(group.children).toHaveLength(1);
    expect(group.children[0]?.kind).toBe('tool_invocation');

    const child = group.children[0] as GroupedBlock & { kind: 'tool_invocation' };
    expect(child.toolUse.toolName).toBe('Read');
    expect(child.toolResult?.content).toBe('file data');
  });

  it('handles pending tool_use without result', () => {
    const blocks: ContentBlock[] = [toolUse('tu-1', 'Bash')];
    const grouped = groupContentBlocks(blocks);
    expect(grouped).toHaveLength(1);
    const inv = grouped[0] as GroupedBlock & { kind: 'tool_invocation' };
    expect(inv.toolResult).toBeNull();
  });

  it('does not nest non-Task tool calls even with children', () => {
    const blocks: ContentBlock[] = [
      toolUse('read-1', 'Read'),
      toolUse('child-1', 'Grep', 'read-1'),
    ];
    const grouped = groupContentBlocks(blocks);
    expect(grouped).toHaveLength(1);
    expect(grouped[0]?.kind).toBe('tool_invocation');
  });

  it('groups ExitPlanMode as plan kind with extracted markdown', () => {
    const planInput = JSON.stringify({ plan: '# My Plan\n\n1. Step one\n2. Step two' });
    const blocks: ContentBlock[] = [
      {
        type: 'tool_use',
        toolUseId: 'epm-1',
        toolName: 'ExitPlanMode',
        input: planInput,
        parentToolUseId: null,
      },
      toolResult('epm-1', 'Plan approved'),
    ];
    const grouped = groupContentBlocks(blocks);
    expect(grouped).toHaveLength(1);
    expect(grouped[0]?.kind).toBe('plan');

    const plan = grouped[0] as GroupedBlock & { kind: 'plan' };
    expect(plan.toolUse.toolUseId).toBe('epm-1');
    expect(plan.toolResult?.content).toBe('Plan approved');
    expect(plan.markdown).toBe('# My Plan\n\n1. Step one\n2. Step two');
  });

  it('handles ExitPlanMode with malformed JSON gracefully', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'tool_use',
        toolUseId: 'epm-2',
        toolName: 'ExitPlanMode',
        input: 'not-json',
        parentToolUseId: null,
      },
    ];
    const grouped = groupContentBlocks(blocks);
    expect(grouped).toHaveLength(1);
    expect(grouped[0]?.kind).toBe('plan');

    const plan = grouped[0] as GroupedBlock & { kind: 'plan' };
    expect(plan.markdown).toBe('');
  });

  it('handles ExitPlanMode without plan field', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'tool_use',
        toolUseId: 'epm-3',
        toolName: 'ExitPlanMode',
        input: '{}',
        parentToolUseId: null,
      },
    ];
    const grouped = groupContentBlocks(blocks);
    const plan = grouped[0] as GroupedBlock & { kind: 'plan' };
    expect(plan.markdown).toBe('');
  });

  it('groups AskUserQuestion as ask_question kind with parsed questions', () => {
    const input = JSON.stringify({
      questions: [
        {
          question: 'Which auth method?',
          header: 'Auth',
          options: [
            { label: 'JWT', description: 'Stateless tokens' },
            { label: 'Session', description: 'Cookie-based' },
          ],
          multiSelect: false,
        },
      ],
    });
    const blocks: ContentBlock[] = [
      {
        type: 'tool_use',
        toolUseId: 'auq-1',
        toolName: 'AskUserQuestion',
        input,
        parentToolUseId: null,
      },
      toolResult('auq-1', 'User selected JWT'),
    ];
    const grouped = groupContentBlocks(blocks);
    expect(grouped).toHaveLength(1);
    expect(grouped[0]?.kind).toBe('ask_question');

    const q = grouped[0] as GroupedBlock & { kind: 'ask_question' };
    expect(q.toolUse.toolUseId).toBe('auq-1');
    expect(q.toolResult?.content).toBe('User selected JWT');
    expect(q.questions).toHaveLength(1);
    expect(q.questions[0]?.question).toBe('Which auth method?');
    expect(q.questions[0]?.options).toHaveLength(2);
  });

  it('handles AskUserQuestion with malformed JSON gracefully', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'tool_use',
        toolUseId: 'auq-2',
        toolName: 'AskUserQuestion',
        input: 'not-json',
        parentToolUseId: null,
      },
    ];
    const grouped = groupContentBlocks(blocks);
    expect(grouped).toHaveLength(1);
    expect(grouped[0]?.kind).toBe('ask_question');

    const q = grouped[0] as GroupedBlock & { kind: 'ask_question' };
    expect(q.questions).toHaveLength(0);
  });

  it('handles AskUserQuestion without questions field', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'tool_use',
        toolUseId: 'auq-3',
        toolName: 'AskUserQuestion',
        input: '{}',
        parentToolUseId: null,
      },
    ];
    const grouped = groupContentBlocks(blocks);
    const q = grouped[0] as GroupedBlock & { kind: 'ask_question' };
    expect(q.questions).toHaveLength(0);
  });

  it('handles AskUserQuestion pending without tool_result', () => {
    const input = JSON.stringify({
      questions: [
        {
          question: 'Pick one',
          header: 'Choice',
          options: [
            { label: 'A', description: '' },
            { label: 'B', description: '' },
          ],
          multiSelect: false,
        },
      ],
    });
    const blocks: ContentBlock[] = [
      {
        type: 'tool_use',
        toolUseId: 'auq-4',
        toolName: 'AskUserQuestion',
        input,
        parentToolUseId: null,
      },
    ];
    const grouped = groupContentBlocks(blocks);
    const q = grouped[0] as GroupedBlock & { kind: 'ask_question' };
    expect(q.toolResult).toBeNull();
    expect(q.questions).toHaveLength(1);
  });
});
