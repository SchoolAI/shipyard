import { beforeEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import {
  addArtifact,
  getArtifacts,
  getViewedBy,
  isPlanUnread,
  markPlanAsViewed,
  removeArtifact,
} from './yjs-helpers.js';

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

describe('ViewedBy helpers', () => {
  let ydoc: Y.Doc;

  beforeEach(() => {
    ydoc = new Y.Doc();
  });

  it('getViewedBy returns empty object for new doc', () => {
    expect(getViewedBy(ydoc)).toEqual({});
  });

  it('markPlanAsViewed adds user with timestamp', () => {
    const before = Date.now();
    markPlanAsViewed(ydoc, 'user1');
    const after = Date.now();

    const viewedBy = getViewedBy(ydoc);
    expect(viewedBy.user1).toBeDefined();
    expect(viewedBy.user1).toBeGreaterThanOrEqual(before);
    expect(viewedBy.user1).toBeLessThanOrEqual(after);
  });

  it('markPlanAsViewed preserves other users when adding new user', () => {
    // First user marks as viewed
    markPlanAsViewed(ydoc, 'user1');
    const user1Timestamp = getViewedBy(ydoc).user1;

    // Wait a bit so timestamps differ
    // (In practice they might be same millisecond, but the test verifies preservation)

    // Second user marks as viewed
    markPlanAsViewed(ydoc, 'user2');
    const viewedBy = getViewedBy(ydoc);

    // Both users should be present
    expect(Object.keys(viewedBy)).toHaveLength(2);
    expect(viewedBy.user1).toBe(user1Timestamp);
    expect(viewedBy.user2).toBeDefined();
  });

  it('markPlanAsViewed updates timestamp for same user', () => {
    markPlanAsViewed(ydoc, 'user1');
    const firstTimestamp = getViewedBy(ydoc).user1;

    // Wait to ensure different timestamp
    const start = Date.now();
    while (Date.now() === start) {
      /* spin until next ms */
    }

    markPlanAsViewed(ydoc, 'user1');
    const secondTimestamp = getViewedBy(ydoc).user1;

    expect(secondTimestamp).toBeGreaterThan(firstTimestamp);
  });

  it('isPlanUnread returns true when never viewed', () => {
    const metadata = { updatedAt: Date.now() - 1000 };
    expect(isPlanUnread(metadata, 'user1', {})).toBe(true);
  });

  it('isPlanUnread returns false when viewed after update', () => {
    const metadata = { updatedAt: Date.now() - 1000 };
    const viewedBy = { user1: Date.now() }; // Viewed now (after updatedAt)
    expect(isPlanUnread(metadata, 'user1', viewedBy)).toBe(false);
  });

  it('isPlanUnread returns true when viewed before update', () => {
    const viewedAt = Date.now() - 2000;
    const updatedAt = Date.now() - 1000; // Updated after viewed
    const metadata = { updatedAt };
    const viewedBy = { user1: viewedAt };
    expect(isPlanUnread(metadata, 'user1', viewedBy)).toBe(true);
  });

  it('isPlanUnread is per-user', () => {
    const metadata = { updatedAt: Date.now() - 1000 };
    const viewedBy = { user1: Date.now() }; // Only user1 viewed

    expect(isPlanUnread(metadata, 'user1', viewedBy)).toBe(false);
    expect(isPlanUnread(metadata, 'user2', viewedBy)).toBe(true);
  });

  it('markPlanAsViewed works with existing Y.Map viewedBy (the Y.Map spread bug test)', () => {
    // This tests the bug where spreading a Y.Map gave internal properties instead of data
    // First mark creates the Y.Map
    markPlanAsViewed(ydoc, 'user1');

    // Second mark should read the Y.Map correctly and preserve user1
    markPlanAsViewed(ydoc, 'user2');

    const viewedBy = getViewedBy(ydoc);
    expect(Object.keys(viewedBy).sort()).toEqual(['user1', 'user2']);
    expect(typeof viewedBy.user1).toBe('number');
    expect(typeof viewedBy.user2).toBe('number');
  });
});
