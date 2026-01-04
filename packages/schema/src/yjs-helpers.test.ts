import { beforeEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { addArtifact, getArtifacts, removeArtifact } from './yjs-helpers.js';

describe('Artifact helpers', () => {
  let ydoc: Y.Doc;

  beforeEach(() => {
    ydoc = new Y.Doc();
  });

  it('getArtifacts returns empty array for new doc', () => {
    expect(getArtifacts(ydoc)).toEqual([]);
  });

  it('addArtifact adds artifact and getArtifacts retrieves it', () => {
    const artifact = {
      id: 'art-1',
      type: 'screenshot' as const,
      filename: 'test.png',
      url: 'https://example.com/test.png',
    };

    addArtifact(ydoc, artifact);
    expect(getArtifacts(ydoc)).toEqual([artifact]);
  });

  it('addArtifact can add multiple artifacts', () => {
    const artifact1 = {
      id: 'art-1',
      type: 'screenshot' as const,
      filename: 'test.png',
    };
    const artifact2 = {
      id: 'art-2',
      type: 'video' as const,
      filename: 'demo.mp4',
      url: 'https://example.com/demo.mp4',
    };

    addArtifact(ydoc, artifact1);
    addArtifact(ydoc, artifact2);

    const artifacts = getArtifacts(ydoc);
    expect(artifacts).toHaveLength(2);
    expect(artifacts[0]).toEqual(artifact1);
    expect(artifacts[1]).toEqual(artifact2);
  });

  it('removeArtifact removes by ID', () => {
    addArtifact(ydoc, { id: 'art-1', type: 'screenshot', filename: 'a.png' });
    addArtifact(ydoc, { id: 'art-2', type: 'video', filename: 'b.mp4' });

    expect(removeArtifact(ydoc, 'art-1')).toBe(true);

    const artifacts = getArtifacts(ydoc);
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]?.id).toBe('art-2');
  });

  it('removeArtifact returns false for non-existent ID', () => {
    expect(removeArtifact(ydoc, 'nonexistent')).toBe(false);
  });

  it('removeArtifact from empty array returns false', () => {
    expect(removeArtifact(ydoc, 'any-id')).toBe(false);
    expect(getArtifacts(ydoc)).toEqual([]);
  });

  it('getArtifacts filters out invalid entries', () => {
    const array = ydoc.getArray('artifacts');

    // Valid artifact
    array.push([{ id: 'art-1', type: 'screenshot', filename: 'valid.png' }]);

    // Invalid entries (missing required fields)
    array.push([{ id: 'art-2', filename: 'no-type.png' }]); // Missing type
    array.push([{ type: 'screenshot' }]); // Missing id and filename
    array.push([null]); // Completely invalid

    const artifacts = getArtifacts(ydoc);
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]?.id).toBe('art-1');
  });

  it('handles all artifact types', () => {
    const types: Array<{
      type: 'screenshot' | 'video' | 'test_results' | 'diff';
      filename: string;
    }> = [
      { type: 'screenshot', filename: 'screen.png' },
      { type: 'video', filename: 'demo.mp4' },
      { type: 'test_results', filename: 'results.json' },
      { type: 'diff', filename: 'changes.diff' },
    ];

    for (const item of types) {
      addArtifact(ydoc, { id: `id-${item.type}`, ...item });
    }

    const artifacts = getArtifacts(ydoc);
    expect(artifacts).toHaveLength(4);
    expect(artifacts.map((a) => a.type)).toEqual(['screenshot', 'video', 'test_results', 'diff']);
  });
});
