import { LoroDoc, LoroList, LoroMap, type LoroText } from 'loro-crdt';
import { describe, expect, it } from 'vitest';
import { initPlanEditorDoc } from './init-plan-editor-doc';

describe('initPlanEditorDoc', () => {
  it('creates a plan editor container at planEditorDocs[planId]', () => {
    const doc = new LoroDoc();
    initPlanEditorDoc(doc, 'plan-1', '# Hello\n\nworld');

    const planEditorDocs = doc.getMap('planEditorDocs');
    const container = planEditorDocs.get('plan-1');
    expect(container).toBeInstanceOf(LoroMap);
  });

  it('writes doc node structure with nodeName, attributes, and children', () => {
    const doc = new LoroDoc();
    initPlanEditorDoc(doc, 'plan-1', 'Hello');

    const planEditorDocs = doc.getMap('planEditorDocs');
    const rootMap = planEditorDocs.get('plan-1') as LoroMap;

    expect(rootMap.get('nodeName')).toBe('doc');
    expect(rootMap.get('attributes')).toBeInstanceOf(LoroMap);
    expect(rootMap.get('children')).toBeInstanceOf(LoroList);
  });

  it('converts headings with correct level', () => {
    const doc = new LoroDoc();
    initPlanEditorDoc(doc, 'plan-1', '# Title');

    const rootMap = doc.getMap('planEditorDocs').get('plan-1') as LoroMap;
    const children = rootMap.get('children') as LoroList;

    expect(children.length).toBeGreaterThanOrEqual(1);
    const heading = children.get(0) as LoroMap;
    expect(heading.get('nodeName')).toBe('heading');

    const attrs = heading.get('attributes') as LoroMap;
    expect(attrs.get('level')).toBe(1);
  });

  it('converts level 2 and level 3 headings', () => {
    const doc = new LoroDoc();
    initPlanEditorDoc(doc, 'plan-1', '## Second\n\n### Third');

    const rootMap = doc.getMap('planEditorDocs').get('plan-1') as LoroMap;
    const children = rootMap.get('children') as LoroList;

    const h2 = children.get(0) as LoroMap;
    expect(h2.get('nodeName')).toBe('heading');
    expect((h2.get('attributes') as LoroMap).get('level')).toBe(2);

    const h3 = children.get(1) as LoroMap;
    expect(h3.get('nodeName')).toBe('heading');
    expect((h3.get('attributes') as LoroMap).get('level')).toBe(3);
  });

  it('converts paragraphs', () => {
    const doc = new LoroDoc();
    initPlanEditorDoc(doc, 'plan-1', 'Hello world');

    const rootMap = doc.getMap('planEditorDocs').get('plan-1') as LoroMap;
    const children = rootMap.get('children') as LoroList;

    expect(children.length).toBeGreaterThanOrEqual(1);
    const para = children.get(0) as LoroMap;
    expect(para.get('nodeName')).toBe('paragraph');
  });

  it('converts code blocks with language attribute', () => {
    const doc = new LoroDoc();
    const markdown = '```typescript\nconst x = 1;\n```';
    initPlanEditorDoc(doc, 'plan-1', markdown);

    const rootMap = doc.getMap('planEditorDocs').get('plan-1') as LoroMap;
    const children = rootMap.get('children') as LoroList;

    const codeBlock = children.get(0) as LoroMap;
    expect(codeBlock.get('nodeName')).toBe('codeBlock');

    const attrs = codeBlock.get('attributes') as LoroMap;
    expect(attrs.get('language')).toBe('typescript');

    const codeChildren = codeBlock.get('children') as LoroList;
    const text = codeChildren.get(0) as LoroText;
    expect(text.toString()).toBe('const x = 1;');
  });

  it('converts code blocks without language', () => {
    const doc = new LoroDoc();
    const markdown = '```\nplain code\n```';
    initPlanEditorDoc(doc, 'plan-1', markdown);

    const rootMap = doc.getMap('planEditorDocs').get('plan-1') as LoroMap;
    const children = rootMap.get('children') as LoroList;

    const codeBlock = children.get(0) as LoroMap;
    expect(codeBlock.get('nodeName')).toBe('codeBlock');
  });

  it('converts bold and italic marks as delta attributes on LoroText', () => {
    const doc = new LoroDoc();
    initPlanEditorDoc(doc, 'plan-1', '**bold** and *italic*');

    const rootMap = doc.getMap('planEditorDocs').get('plan-1') as LoroMap;
    const children = rootMap.get('children') as LoroList;

    const para = children.get(0) as LoroMap;
    expect(para.get('nodeName')).toBe('paragraph');

    const paraChildren = para.get('children') as LoroList;
    const text = paraChildren.get(0) as LoroText;
    const delta = text.toDelta();

    const boldRun = delta.find((d) => d.attributes && 'bold' in d.attributes);
    expect(boldRun).toBeDefined();
    expect(boldRun?.insert).toBe('bold');

    const italicRun = delta.find((d) => d.attributes && 'italic' in d.attributes);
    expect(italicRun).toBeDefined();
    expect(italicRun?.insert).toBe('italic');
  });

  it('converts bullet lists with listItem children', () => {
    const doc = new LoroDoc();
    initPlanEditorDoc(doc, 'plan-1', '- item 1\n- item 2');

    const rootMap = doc.getMap('planEditorDocs').get('plan-1') as LoroMap;
    const children = rootMap.get('children') as LoroList;

    const bulletList = children.get(0) as LoroMap;
    expect(bulletList.get('nodeName')).toBe('bulletList');

    const listChildren = bulletList.get('children') as LoroList;
    expect(listChildren.length).toBe(2);

    const item1 = listChildren.get(0) as LoroMap;
    expect(item1.get('nodeName')).toBe('listItem');

    const item2 = listChildren.get(1) as LoroMap;
    expect(item2.get('nodeName')).toBe('listItem');
  });

  it('converts ordered lists', () => {
    const doc = new LoroDoc();
    initPlanEditorDoc(doc, 'plan-1', '1. first\n2. second');

    const rootMap = doc.getMap('planEditorDocs').get('plan-1') as LoroMap;
    const children = rootMap.get('children') as LoroList;

    const orderedList = children.get(0) as LoroMap;
    expect(orderedList.get('nodeName')).toBe('orderedList');

    const listChildren = orderedList.get('children') as LoroList;
    expect(listChildren.length).toBe(2);

    const item1 = listChildren.get(0) as LoroMap;
    expect(item1.get('nodeName')).toBe('listItem');
  });

  it('handles empty markdown with empty children list', () => {
    const doc = new LoroDoc();
    initPlanEditorDoc(doc, 'plan-1', '');

    const rootMap = doc.getMap('planEditorDocs').get('plan-1') as LoroMap;
    expect(rootMap.get('nodeName')).toBe('doc');

    const children = rootMap.get('children') as LoroList;
    expect(children.length).toBe(0);
  });

  it('is idempotent - calling again with same planId overwrites', () => {
    const doc = new LoroDoc();
    initPlanEditorDoc(doc, 'plan-1', '# First');
    initPlanEditorDoc(doc, 'plan-1', '# Second');

    const rootMap = doc.getMap('planEditorDocs').get('plan-1') as LoroMap;
    const children = rootMap.get('children') as LoroList;
    const heading = children.get(0) as LoroMap;
    expect(heading.get('nodeName')).toBe('heading');

    const headingChildren = heading.get('children') as LoroList;
    const text = headingChildren.get(0) as LoroText;
    expect(text.toString()).toBe('Second');
  });
});
