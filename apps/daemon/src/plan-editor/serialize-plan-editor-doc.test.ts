import { LoroDoc } from 'loro-crdt';
import { describe, expect, it } from 'vitest';
import { initPlanEditorDoc } from './init-plan-editor-doc';
import { serializePlanEditorDoc } from './serialize-plan-editor-doc';

describe('serializePlanEditorDoc', () => {
  it('roundtrips simple paragraph', () => {
    const doc = new LoroDoc();
    initPlanEditorDoc(doc, 'plan-1', 'Hello world');

    const result = serializePlanEditorDoc(doc, 'plan-1');
    expect(result).toContain('Hello world');
  });

  it('roundtrips heading', () => {
    const doc = new LoroDoc();
    initPlanEditorDoc(doc, 'plan-1', '# Title');

    const result = serializePlanEditorDoc(doc, 'plan-1');
    expect(result).toMatch(/^# Title/);
  });

  it('roundtrips multiple heading levels', () => {
    const doc = new LoroDoc();
    initPlanEditorDoc(doc, 'plan-1', '## Sub Title');

    const result = serializePlanEditorDoc(doc, 'plan-1');
    expect(result).toContain('## Sub Title');
  });

  it('roundtrips code block with language', () => {
    const doc = new LoroDoc();
    const markdown = '```typescript\nconst x = 1;\n```';
    initPlanEditorDoc(doc, 'plan-1', markdown);

    const result = serializePlanEditorDoc(doc, 'plan-1');
    expect(result).toContain('```typescript');
    expect(result).toContain('const x = 1;');
    expect(result).toContain('```');
  });

  it('roundtrips code block without language', () => {
    const doc = new LoroDoc();
    const markdown = '```\nsome code\n```';
    initPlanEditorDoc(doc, 'plan-1', markdown);

    const result = serializePlanEditorDoc(doc, 'plan-1');
    expect(result).toContain('some code');
  });

  it('roundtrips bold text', () => {
    const doc = new LoroDoc();
    initPlanEditorDoc(doc, 'plan-1', '**bold** text');

    const result = serializePlanEditorDoc(doc, 'plan-1');
    expect(result).toContain('**bold**');
    expect(result).toContain('text');
  });

  it('roundtrips italic text', () => {
    const doc = new LoroDoc();
    initPlanEditorDoc(doc, 'plan-1', '*italic* text');

    const result = serializePlanEditorDoc(doc, 'plan-1');
    expect(result).toContain('*italic*');
  });

  it('roundtrips bullet lists', () => {
    const doc = new LoroDoc();
    initPlanEditorDoc(doc, 'plan-1', '- item 1\n- item 2');

    const result = serializePlanEditorDoc(doc, 'plan-1');
    expect(result).toContain('- item 1');
    expect(result).toContain('- item 2');
  });

  it('roundtrips ordered lists', () => {
    const doc = new LoroDoc();
    initPlanEditorDoc(doc, 'plan-1', '1. first\n2. second');

    const result = serializePlanEditorDoc(doc, 'plan-1');
    expect(result).toContain('1.');
    expect(result).toContain('first');
    expect(result).toContain('2.');
    expect(result).toContain('second');
  });

  it('returns empty string for missing planId', () => {
    const doc = new LoroDoc();
    const result = serializePlanEditorDoc(doc, 'nonexistent');
    expect(result).toBe('');
  });

  it('returns empty string for planId not initialized', () => {
    const doc = new LoroDoc();
    initPlanEditorDoc(doc, 'plan-1', 'Hello');

    const result = serializePlanEditorDoc(doc, 'plan-2');
    expect(result).toBe('');
  });

  it('roundtrips complex document with mixed content', () => {
    const doc = new LoroDoc();
    const markdown = [
      '# Main Title',
      '',
      'Some introductory text with **bold** words.',
      '',
      '## Section One',
      '',
      '- bullet one',
      '- bullet two',
      '',
      '```javascript',
      'function hello() {}',
      '```',
      '',
      '1. step one',
      '2. step two',
    ].join('\n');

    initPlanEditorDoc(doc, 'plan-1', markdown);

    const result = serializePlanEditorDoc(doc, 'plan-1');
    expect(result).toContain('# Main Title');
    expect(result).toContain('## Section One');
    expect(result).toContain('**bold**');
    expect(result).toContain('bullet one');
    expect(result).toContain('bullet two');
    expect(result).toContain('function hello() {}');
    expect(result).toContain('step one');
    expect(result).toContain('step two');
  });

  it('roundtrips markdown links', () => {
    const doc = new LoroDoc();
    initPlanEditorDoc(doc, 'plan-1', 'See [docs](https://example.com) here');

    const result = serializePlanEditorDoc(doc, 'plan-1');
    expect(result).toContain('[docs](https://example.com)');
  });

  it('roundtrips strikethrough', () => {
    const doc = new LoroDoc();
    initPlanEditorDoc(doc, 'plan-1', '~~deleted~~ text');

    const result = serializePlanEditorDoc(doc, 'plan-1');
    expect(result).toContain('~~deleted~~');
  });

  it('handles empty markdown roundtrip', () => {
    const doc = new LoroDoc();
    initPlanEditorDoc(doc, 'plan-1', '');

    const result = serializePlanEditorDoc(doc, 'plan-1');
    expect(result).toBe('');
  });
});
