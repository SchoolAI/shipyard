import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import type { PlanIndexEntry } from './plan-index.js';
import {
  getPlanIndex,
  getPlanIndexEntry,
  removePlanIndexEntry,
  setPlanIndexEntry,
  touchPlanIndexEntry,
} from './plan-index-helpers.js';

describe('Plan Index Helpers', () => {
  const createEntry = (overrides: Partial<PlanIndexEntry> = {}): PlanIndexEntry => ({
    id: 'plan-1',
    title: 'Test Plan',
    status: 'draft',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ownerId: 'test-user',
    ...overrides,
  });

  describe('setPlanIndexEntry / getPlanIndexEntry', () => {
    it('round-trips plan entries correctly', () => {
      const ydoc = new Y.Doc();
      const entry = createEntry();

      setPlanIndexEntry(ydoc, entry);
      const retrieved = getPlanIndexEntry(ydoc, 'plan-1');

      expect(retrieved).toEqual(entry);
    });

    it('overwrites existing entry with same id', () => {
      const ydoc = new Y.Doc();
      const entry1 = createEntry({ title: 'Original' });
      const entry2 = createEntry({ title: 'Updated' });

      setPlanIndexEntry(ydoc, entry1);
      setPlanIndexEntry(ydoc, entry2);

      const retrieved = getPlanIndexEntry(ydoc, 'plan-1');
      expect(retrieved?.title).toBe('Updated');
    });

    it('returns null for non-existent entry', () => {
      const ydoc = new Y.Doc();
      const retrieved = getPlanIndexEntry(ydoc, 'non-existent');
      expect(retrieved).toBeNull();
    });

    it('handles all status values', () => {
      const ydoc = new Y.Doc();
      const statuses = ['draft', 'pending_review', 'approved', 'changes_requested'] as const;

      for (const status of statuses) {
        const entry = createEntry({ id: `plan-${status}`, status });
        setPlanIndexEntry(ydoc, entry);
        const retrieved = getPlanIndexEntry(ydoc, `plan-${status}`);
        expect(retrieved?.status).toBe(status);
      }
    });
  });

  describe('getPlanIndex', () => {
    it('returns empty array for empty doc', () => {
      const ydoc = new Y.Doc();
      const plans = getPlanIndex(ydoc);
      expect(plans).toEqual([]);
    });

    it('returns all plans', () => {
      const ydoc = new Y.Doc();
      setPlanIndexEntry(ydoc, createEntry({ id: 'plan-1' }));
      setPlanIndexEntry(ydoc, createEntry({ id: 'plan-2' }));
      setPlanIndexEntry(ydoc, createEntry({ id: 'plan-3' }));

      const plans = getPlanIndex(ydoc);
      expect(plans).toHaveLength(3);
    });

    it('returns sorted by updatedAt descending (most recent first)', () => {
      const ydoc = new Y.Doc();
      const now = Date.now();

      setPlanIndexEntry(ydoc, createEntry({ id: 'old', updatedAt: now - 1000 }));
      setPlanIndexEntry(ydoc, createEntry({ id: 'new', updatedAt: now }));
      setPlanIndexEntry(ydoc, createEntry({ id: 'middle', updatedAt: now - 500 }));

      const plans = getPlanIndex(ydoc);
      expect(plans[0]?.id).toBe('new');
      expect(plans[1]?.id).toBe('middle');
      expect(plans[2]?.id).toBe('old');
    });

    it('skips invalid entries', () => {
      const ydoc = new Y.Doc();
      const plansMap = ydoc.getMap<Record<string, unknown>>('plans');

      setPlanIndexEntry(ydoc, createEntry({ id: 'valid' }));
      plansMap.set('invalid', { foo: 'bar' });

      const plans = getPlanIndex(ydoc);
      expect(plans).toHaveLength(1);
      expect(plans[0]?.id).toBe('valid');
    });
  });

  describe('removePlanIndexEntry', () => {
    it('removes existing entry', () => {
      const ydoc = new Y.Doc();
      setPlanIndexEntry(ydoc, createEntry({ id: 'plan-1' }));

      removePlanIndexEntry(ydoc, 'plan-1');

      expect(getPlanIndexEntry(ydoc, 'plan-1')).toBeNull();
    });

    it('does nothing for non-existent entry', () => {
      const ydoc = new Y.Doc();
      removePlanIndexEntry(ydoc, 'non-existent');
      expect(getPlanIndex(ydoc)).toHaveLength(0);
    });

    it('does not affect other entries', () => {
      const ydoc = new Y.Doc();
      setPlanIndexEntry(ydoc, createEntry({ id: 'plan-1' }));
      setPlanIndexEntry(ydoc, createEntry({ id: 'plan-2' }));

      removePlanIndexEntry(ydoc, 'plan-1');

      expect(getPlanIndexEntry(ydoc, 'plan-1')).toBeNull();
      expect(getPlanIndexEntry(ydoc, 'plan-2')).not.toBeNull();
    });
  });

  describe('touchPlanIndexEntry', () => {
    it('updates only updatedAt timestamp', () => {
      const ydoc = new Y.Doc();
      const originalTime = Date.now() - 10000;
      const entry = createEntry({
        id: 'plan-1',
        title: 'Original Title',
        createdAt: originalTime,
        updatedAt: originalTime,
      });

      setPlanIndexEntry(ydoc, entry);
      touchPlanIndexEntry(ydoc, 'plan-1');

      const retrieved = getPlanIndexEntry(ydoc, 'plan-1');
      expect(retrieved?.title).toBe('Original Title');
      expect(retrieved?.createdAt).toBe(originalTime);
      expect(retrieved?.updatedAt).toBeGreaterThan(originalTime);
    });

    it('does nothing for non-existent entry', () => {
      const ydoc = new Y.Doc();
      touchPlanIndexEntry(ydoc, 'non-existent');
      expect(getPlanIndex(ydoc)).toHaveLength(0);
    });
  });

  describe('CRDT sync behavior', () => {
    it('syncs changes between two docs', () => {
      const doc1 = new Y.Doc();
      const doc2 = new Y.Doc();

      setPlanIndexEntry(doc1, createEntry({ id: 'plan-1', title: 'From Doc1' }));

      const update = Y.encodeStateAsUpdate(doc1);
      Y.applyUpdate(doc2, update);

      const retrieved = getPlanIndexEntry(doc2, 'plan-1');
      expect(retrieved?.title).toBe('From Doc1');
    });

    it('merges concurrent changes', () => {
      const doc1 = new Y.Doc();
      const doc2 = new Y.Doc();

      setPlanIndexEntry(doc1, createEntry({ id: 'plan-a', title: 'Plan A' }));
      setPlanIndexEntry(doc2, createEntry({ id: 'plan-b', title: 'Plan B' }));

      Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1));
      Y.applyUpdate(doc1, Y.encodeStateAsUpdate(doc2));

      expect(getPlanIndex(doc1)).toHaveLength(2);
      expect(getPlanIndex(doc2)).toHaveLength(2);
    });
  });
});
