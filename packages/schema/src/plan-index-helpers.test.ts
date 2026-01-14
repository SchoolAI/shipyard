import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import type { PlanIndexEntry } from './plan-index.js';
import {
  getAllViewedByFromIndex,
  getPlanIndex,
  getPlanIndexEntry,
  getViewedByFromIndex,
  removePlanIndexEntry,
  removeViewedByFromIndex,
  setPlanIndexEntry,
  touchPlanIndexEntry,
  updatePlanIndexViewedBy,
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
      const statuses = [
        'draft',
        'pending_review',
        'in_progress',
        'completed',
        'changes_requested',
      ] as const;

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

  describe('ViewedBy Helpers (Cross-Device Inbox Sync)', () => {
    describe('getViewedByFromIndex', () => {
      it('returns empty object for new doc', () => {
        const ydoc = new Y.Doc();
        expect(getViewedByFromIndex(ydoc, 'plan-1')).toEqual({});
      });

      it('returns empty object for non-existent plan', () => {
        const ydoc = new Y.Doc();
        updatePlanIndexViewedBy(ydoc, 'plan-1', 'user1');
        expect(getViewedByFromIndex(ydoc, 'plan-2')).toEqual({});
      });
    });

    describe('updatePlanIndexViewedBy', () => {
      it('adds user with timestamp', () => {
        const ydoc = new Y.Doc();
        const before = Date.now();

        updatePlanIndexViewedBy(ydoc, 'plan-1', 'user1');

        const viewedBy = getViewedByFromIndex(ydoc, 'plan-1');
        expect(viewedBy.user1).toBeGreaterThanOrEqual(before);
        expect(viewedBy.user1).toBeLessThanOrEqual(Date.now());
      });

      it('preserves other users when adding new one', () => {
        const ydoc = new Y.Doc();

        updatePlanIndexViewedBy(ydoc, 'plan-1', 'user1');
        const user1Time = getViewedByFromIndex(ydoc, 'plan-1').user1;

        updatePlanIndexViewedBy(ydoc, 'plan-1', 'user2');

        const viewedBy = getViewedByFromIndex(ydoc, 'plan-1');
        expect(viewedBy.user1).toBe(user1Time);
        expect(viewedBy.user2).toBeDefined();
      });

      it('updates timestamp on re-view', async () => {
        const ydoc = new Y.Doc();

        updatePlanIndexViewedBy(ydoc, 'plan-1', 'user1');
        const firstTime = getViewedByFromIndex(ydoc, 'plan-1').user1;

        // Wait a bit to ensure different timestamp
        await new Promise((resolve) => setTimeout(resolve, 5));

        updatePlanIndexViewedBy(ydoc, 'plan-1', 'user1');
        const secondTime = getViewedByFromIndex(ydoc, 'plan-1').user1;

        expect(firstTime).toBeDefined();
        expect(secondTime).toBeGreaterThan(firstTime as number);
      });

      it('handles multiple plans independently', () => {
        const ydoc = new Y.Doc();

        updatePlanIndexViewedBy(ydoc, 'plan-1', 'user1');
        updatePlanIndexViewedBy(ydoc, 'plan-2', 'user2');

        expect(Object.keys(getViewedByFromIndex(ydoc, 'plan-1'))).toEqual(['user1']);
        expect(Object.keys(getViewedByFromIndex(ydoc, 'plan-2'))).toEqual(['user2']);
      });
    });

    describe('getAllViewedByFromIndex', () => {
      it('returns batch results', () => {
        const ydoc = new Y.Doc();

        updatePlanIndexViewedBy(ydoc, 'plan-1', 'user1');
        updatePlanIndexViewedBy(ydoc, 'plan-2', 'user2');

        const result = getAllViewedByFromIndex(ydoc, ['plan-1', 'plan-2', 'plan-3']);

        expect(result['plan-1']?.user1).toBeDefined();
        expect(result['plan-2']?.user2).toBeDefined();
        expect(result['plan-3']).toEqual({});
      });

      it('returns empty objects for empty planIds array', () => {
        const ydoc = new Y.Doc();
        updatePlanIndexViewedBy(ydoc, 'plan-1', 'user1');

        const result = getAllViewedByFromIndex(ydoc, []);
        expect(result).toEqual({});
      });
    });

    describe('removeViewedByFromIndex', () => {
      it('removes viewedBy data for a plan', () => {
        const ydoc = new Y.Doc();

        updatePlanIndexViewedBy(ydoc, 'plan-1', 'user1');
        expect(getViewedByFromIndex(ydoc, 'plan-1').user1).toBeDefined();

        removeViewedByFromIndex(ydoc, 'plan-1');
        expect(getViewedByFromIndex(ydoc, 'plan-1')).toEqual({});
      });

      it('does not affect other plans', () => {
        const ydoc = new Y.Doc();

        updatePlanIndexViewedBy(ydoc, 'plan-1', 'user1');
        updatePlanIndexViewedBy(ydoc, 'plan-2', 'user2');

        removeViewedByFromIndex(ydoc, 'plan-1');

        expect(getViewedByFromIndex(ydoc, 'plan-1')).toEqual({});
        expect(getViewedByFromIndex(ydoc, 'plan-2').user2).toBeDefined();
      });
    });

    describe('CRDT sync for viewedBy', () => {
      it('syncs viewedBy between two docs', () => {
        const doc1 = new Y.Doc();
        const doc2 = new Y.Doc();

        updatePlanIndexViewedBy(doc1, 'plan-1', 'user1');

        Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1));

        expect(getViewedByFromIndex(doc2, 'plan-1').user1).toBeDefined();
      });

      it('merges concurrent viewedBy updates from different users on synced docs', () => {
        const doc1 = new Y.Doc();
        const doc2 = new Y.Doc();

        // First sync docs so they share the same Y.Map structure
        updatePlanIndexViewedBy(doc1, 'plan-1', 'user1');
        Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1));

        // Now both docs have the same nested Y.Map for plan-1
        // User2 updates from doc2
        updatePlanIndexViewedBy(doc2, 'plan-1', 'user2');

        // Sync back to doc1
        Y.applyUpdate(doc1, Y.encodeStateAsUpdate(doc2));

        // Both users should be present in both docs
        const viewedBy1 = getViewedByFromIndex(doc1, 'plan-1');
        const viewedBy2 = getViewedByFromIndex(doc2, 'plan-1');

        expect(Object.keys(viewedBy1).sort()).toEqual(['user1', 'user2']);
        expect(Object.keys(viewedBy2).sort()).toEqual(['user1', 'user2']);
      });
    });
  });
});
