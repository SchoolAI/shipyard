import { beforeEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import type { ChangeSnapshot } from './change-snapshot.js';
import type { Deliverable, LinkedPR } from './plan.js';
import {
  addArtifact,
  addDeliverable,
  approveUser,
  getApprovedUsers,
  getArtifacts,
  getChangeSnapshot,
  getChangeSnapshots,
  getDeliverables,
  getLinkedPR,
  getLinkedPRs,
  getPlanMetadata,
  getPlanMetadataWithValidation,
  getPlanOwnerId,
  getRejectedUsers,
  getViewedBy,
  initPlanMetadata,
  isApprovalRequired,
  isPlanUnread,
  isUserApproved,
  isUserRejected,
  linkArtifactToDeliverable,
  linkPR,
  markMachineDisconnected,
  markPlanAsViewed,
  rejectUser,
  removeArtifact,
  removeChangeSnapshot,
  revokeUser,
  setChangeSnapshot,
  setPlanMetadata,
  transitionPlanStatus,
  unlinkPR,
  unrejectUser,
  updateLinkedPRStatus,
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
      type: 'image' as const,
      filename: 'test.png',
      storage: 'github' as const,
      url: 'https://example.com/test.png',
    };

    addArtifact(ydoc, artifact);
    expect(getArtifacts(ydoc)).toEqual([artifact]);
  });

  it('addArtifact can add multiple artifacts', () => {
    const artifact1 = {
      id: 'art-1',
      type: 'image' as const,
      filename: 'test.png',
      storage: 'github' as const,
      url: 'https://example.com/test.png',
    };
    const artifact2 = {
      id: 'art-2',
      type: 'video' as const,
      filename: 'demo.mp4',
      storage: 'github' as const,
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
    addArtifact(ydoc, {
      id: 'art-1',
      type: 'image',
      filename: 'a.png',
      storage: 'github',
      url: 'https://example.com/a.png',
    });
    addArtifact(ydoc, {
      id: 'art-2',
      type: 'video',
      filename: 'b.mp4',
      storage: 'github',
      url: 'https://example.com/b.mp4',
    });

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

    array.push([
      {
        id: 'art-1',
        type: 'image',
        filename: 'valid.png',
        storage: 'github',
        url: 'https://example.com/valid.png',
      },
    ]);

    array.push([{ id: 'art-2', filename: 'no-type.png' }]);
    array.push([{ type: 'image' }]);
    array.push([null]);

    const artifacts = getArtifacts(ydoc);
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]?.id).toBe('art-1');
  });

  it('handles all artifact types', () => {
    const types: Array<{
      type: 'html' | 'image' | 'video';
      filename: string;
    }> = [
      { type: 'html', filename: 'report.html' },
      { type: 'image', filename: 'screen.png' },
      { type: 'video', filename: 'demo.mp4' },
    ];

    for (const item of types) {
      addArtifact(ydoc, {
        id: `id-${item.type}`,
        ...item,
        storage: 'github',
        url: `https://example.com/${item.filename}`,
      });
    }

    const artifacts = getArtifacts(ydoc);
    expect(artifacts).toHaveLength(3);
    expect(artifacts.map((a) => a.type)).toEqual(['html', 'image', 'video']);
  });

  describe('addArtifact validation', () => {
    it('rejects invalid artifact (missing required fields)', () => {
      const invalidArtifact = {
        id: 'art-1',
        type: 'image',
      } as any;

      expect(() => addArtifact(ydoc, invalidArtifact)).toThrow();
    });

    it('rejects artifact with invalid storage type', () => {
      const invalidArtifact = {
        id: 'art-1',
        type: 'image',
        filename: 'test.png',
        storage: 'invalid-storage',
        url: 'https://example.com/test.png',
      } as any;

      expect(() => addArtifact(ydoc, invalidArtifact)).toThrow();
    });

    it('rejects github artifact without url', () => {
      const invalidArtifact = {
        id: 'art-1',
        type: 'image',
        filename: 'test.png',
        storage: 'github',
      } as any;

      expect(() => addArtifact(ydoc, invalidArtifact)).toThrow();
    });

    it('rejects local artifact without localArtifactId', () => {
      const invalidArtifact = {
        id: 'art-1',
        type: 'image',
        filename: 'test.png',
        storage: 'local',
      } as any;

      expect(() => addArtifact(ydoc, invalidArtifact)).toThrow();
    });

    it('accepts valid github artifact', () => {
      const validArtifact = {
        id: 'art-1',
        type: 'image' as const,
        filename: 'test.png',
        storage: 'github' as const,
        url: 'https://example.com/test.png',
      };

      expect(() => addArtifact(ydoc, validArtifact)).not.toThrow();
      expect(getArtifacts(ydoc)).toHaveLength(1);
    });

    it('accepts valid local artifact', () => {
      const validArtifact = {
        id: 'art-1',
        type: 'image' as const,
        filename: 'test.png',
        storage: 'local' as const,
        localArtifactId: 'local-123',
      };

      expect(() => addArtifact(ydoc, validArtifact)).not.toThrow();
      expect(getArtifacts(ydoc)).toHaveLength(1);
    });
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
    markPlanAsViewed(ydoc, 'user1');
    const user1Timestamp = getViewedBy(ydoc).user1;

    markPlanAsViewed(ydoc, 'user2');
    const viewedBy = getViewedBy(ydoc);

    expect(Object.keys(viewedBy)).toHaveLength(2);
    expect(viewedBy.user1).toBe(user1Timestamp);
    expect(viewedBy.user2).toBeDefined();
  });

  it('markPlanAsViewed updates timestamp for same user', () => {
    markPlanAsViewed(ydoc, 'user1');
    const firstTimestamp = getViewedBy(ydoc).user1;

    const start = Date.now();
    while (Date.now() === start) {
      /* spin until next ms */
    }

    markPlanAsViewed(ydoc, 'user1');
    const secondTimestamp = getViewedBy(ydoc).user1;

    expect(firstTimestamp).toBeDefined();
    expect(secondTimestamp).toBeGreaterThan(firstTimestamp ?? 0);
  });

  it('isPlanUnread returns true when never viewed', () => {
    const metadata = { updatedAt: Date.now() - 1000 };
    expect(isPlanUnread(metadata, 'user1', {})).toBe(true);
  });

  it('isPlanUnread returns false when viewed after update', () => {
    const metadata = { updatedAt: Date.now() - 1000 };
    const viewedBy = { user1: Date.now() };
    expect(isPlanUnread(metadata, 'user1', viewedBy)).toBe(false);
  });

  it('isPlanUnread returns true when viewed before update', () => {
    const viewedAt = Date.now() - 2000;
    const updatedAt = Date.now() - 1000;
    const metadata = { updatedAt };
    const viewedBy = { user1: viewedAt };
    expect(isPlanUnread(metadata, 'user1', viewedBy)).toBe(true);
  });

  it('isPlanUnread is per-user', () => {
    const metadata = { updatedAt: Date.now() - 1000 };
    const viewedBy = { user1: Date.now() };

    expect(isPlanUnread(metadata, 'user1', viewedBy)).toBe(false);
    expect(isPlanUnread(metadata, 'user2', viewedBy)).toBe(true);
  });

  it('markPlanAsViewed works with existing Y.Map viewedBy (the Y.Map spread bug test)', () => {
    markPlanAsViewed(ydoc, 'user1');

    markPlanAsViewed(ydoc, 'user2');

    const viewedBy = getViewedBy(ydoc);
    expect(Object.keys(viewedBy).sort()).toEqual(['user1', 'user2']);
    expect(typeof viewedBy.user1).toBe('number');
    expect(typeof viewedBy.user2).toBe('number');
  });
});

describe('User access control helpers', () => {
  let ydoc: Y.Doc;

  beforeEach(() => {
    ydoc = new Y.Doc();
  });

  describe('getApprovedUsers', () => {
    it('returns empty array for new doc', () => {
      expect(getApprovedUsers(ydoc)).toEqual([]);
    });

    it('returns empty array when approvedUsers is not an array', () => {
      const map = ydoc.getMap('metadata');
      map.set('approvedUsers', 'not-an-array');
      expect(getApprovedUsers(ydoc)).toEqual([]);
    });

    it('filters out non-string entries', () => {
      const map = ydoc.getMap('metadata');
      map.set('approvedUsers', ['user1', 123, null, 'user2', undefined]);
      expect(getApprovedUsers(ydoc)).toEqual(['user1', 'user2']);
    });

    it('returns approved users list', () => {
      const map = ydoc.getMap('metadata');
      map.set('approvedUsers', ['user1', 'user2']);
      expect(getApprovedUsers(ydoc)).toEqual(['user1', 'user2']);
    });
  });

  describe('getRejectedUsers', () => {
    it('returns empty array for new doc', () => {
      expect(getRejectedUsers(ydoc)).toEqual([]);
    });

    it('returns empty array when rejectedUsers is not an array', () => {
      const map = ydoc.getMap('metadata');
      map.set('rejectedUsers', 'not-an-array');
      expect(getRejectedUsers(ydoc)).toEqual([]);
    });

    it('filters out non-string entries', () => {
      const map = ydoc.getMap('metadata');
      map.set('rejectedUsers', ['bad1', 456, null, 'bad2']);
      expect(getRejectedUsers(ydoc)).toEqual(['bad1', 'bad2']);
    });

    it('returns rejected users list', () => {
      const map = ydoc.getMap('metadata');
      map.set('rejectedUsers', ['bad1', 'bad2']);
      expect(getRejectedUsers(ydoc)).toEqual(['bad1', 'bad2']);
    });
  });

  describe('isUserApproved', () => {
    it('returns false for new doc without any approvedUsers', () => {
      expect(isUserApproved(ydoc, 'user1')).toBe(false);
    });

    it('returns true when user is in approvedUsers', () => {
      const map = ydoc.getMap('metadata');
      map.set('approvedUsers', ['user1', 'user2']);
      expect(isUserApproved(ydoc, 'user1')).toBe(true);
      expect(isUserApproved(ydoc, 'user2')).toBe(true);
    });

    it('returns false when user is not in approvedUsers', () => {
      const map = ydoc.getMap('metadata');
      map.set('approvedUsers', ['user1']);
      expect(isUserApproved(ydoc, 'user2')).toBe(false);
    });

    it('returns true when user is the owner (even if not in approvedUsers)', () => {
      const map = ydoc.getMap('metadata');
      map.set('ownerId', 'owner1');
      map.set('approvedUsers', ['other-user']);
      expect(isUserApproved(ydoc, 'owner1')).toBe(true);
    });
  });

  describe('isUserRejected', () => {
    it('returns false for new doc', () => {
      expect(isUserRejected(ydoc, 'user1')).toBe(false);
    });

    it('returns true when user is in rejectedUsers', () => {
      const map = ydoc.getMap('metadata');
      map.set('rejectedUsers', ['bad1', 'bad2']);
      expect(isUserRejected(ydoc, 'bad1')).toBe(true);
    });

    it('returns false when user is not in rejectedUsers', () => {
      const map = ydoc.getMap('metadata');
      map.set('rejectedUsers', ['bad1']);
      expect(isUserRejected(ydoc, 'good-user')).toBe(false);
    });
  });

  describe('approveUser', () => {
    it('adds user to approvedUsers', () => {
      approveUser(ydoc, 'user1');
      expect(getApprovedUsers(ydoc)).toContain('user1');
    });

    it('preserves existing approved users', () => {
      const map = ydoc.getMap('metadata');
      map.set('approvedUsers', ['existing-user']);

      approveUser(ydoc, 'new-user');

      const approved = getApprovedUsers(ydoc);
      expect(approved).toContain('existing-user');
      expect(approved).toContain('new-user');
    });

    it('does not duplicate already approved user', () => {
      approveUser(ydoc, 'user1');
      approveUser(ydoc, 'user1');

      const approved = getApprovedUsers(ydoc);
      expect(approved.filter((u) => u === 'user1')).toHaveLength(1);
    });

    it('updates updatedAt timestamp', () => {
      const map = ydoc.getMap('metadata');
      const before = Date.now();

      approveUser(ydoc, 'user1');

      const updatedAt = map.get('updatedAt') as number;
      expect(updatedAt).toBeGreaterThanOrEqual(before);
    });
  });

  describe('revokeUser', () => {
    it('returns false when user is not in approvedUsers', () => {
      expect(revokeUser(ydoc, 'user1')).toBe(false);
    });

    it('removes user from approvedUsers and returns true', () => {
      const map = ydoc.getMap('metadata');
      map.set('approvedUsers', ['user1', 'user2']);

      expect(revokeUser(ydoc, 'user1')).toBe(true);
      expect(getApprovedUsers(ydoc)).toEqual(['user2']);
    });

    it('updates updatedAt timestamp when successful', () => {
      const map = ydoc.getMap('metadata');
      map.set('approvedUsers', ['user1']);
      const before = Date.now();

      revokeUser(ydoc, 'user1');

      const updatedAt = map.get('updatedAt') as number;
      expect(updatedAt).toBeGreaterThanOrEqual(before);
    });

    it('cannot revoke the plan owner', () => {
      const map = ydoc.getMap('metadata');
      map.set('ownerId', 'owner123');
      map.set('approvedUsers', ['owner123', 'user1']);

      const result = revokeUser(ydoc, 'owner123');

      expect(result).toBe(false);
      expect(getApprovedUsers(ydoc)).toContain('owner123');
    });
  });

  describe('rejectUser', () => {
    it('adds user to rejectedUsers', () => {
      rejectUser(ydoc, 'bad-user');
      expect(getRejectedUsers(ydoc)).toContain('bad-user');
    });

    it('removes user from approvedUsers when rejecting', () => {
      const map = ydoc.getMap('metadata');
      map.set('approvedUsers', ['user1', 'user2']);

      rejectUser(ydoc, 'user1');

      expect(getApprovedUsers(ydoc)).toEqual(['user2']);
      expect(getRejectedUsers(ydoc)).toContain('user1');
    });

    it('does not duplicate already rejected user', () => {
      rejectUser(ydoc, 'bad-user');
      rejectUser(ydoc, 'bad-user');

      const rejected = getRejectedUsers(ydoc);
      expect(rejected.filter((u) => u === 'bad-user')).toHaveLength(1);
    });

    it('updates updatedAt timestamp', () => {
      const before = Date.now();
      rejectUser(ydoc, 'bad-user');

      const map = ydoc.getMap('metadata');
      const updatedAt = map.get('updatedAt') as number;
      expect(updatedAt).toBeGreaterThanOrEqual(before);
    });

    it('cannot reject the plan owner', () => {
      const map = ydoc.getMap('metadata');
      map.set('ownerId', 'owner123');
      map.set('approvedUsers', ['owner123', 'user1']);

      rejectUser(ydoc, 'owner123');

      expect(getApprovedUsers(ydoc)).toContain('owner123');
      expect(getRejectedUsers(ydoc)).not.toContain('owner123');
    });
  });

  describe('unrejectUser', () => {
    it('returns false when user is not in rejectedUsers', () => {
      expect(unrejectUser(ydoc, 'user1')).toBe(false);
    });

    it('removes user from rejectedUsers and returns true', () => {
      const map = ydoc.getMap('metadata');
      map.set('rejectedUsers', ['bad1', 'bad2']);

      expect(unrejectUser(ydoc, 'bad1')).toBe(true);
      expect(getRejectedUsers(ydoc)).toEqual(['bad2']);
    });

    it('updates updatedAt timestamp when successful', () => {
      const map = ydoc.getMap('metadata');
      map.set('rejectedUsers', ['bad-user']);
      const before = Date.now();

      unrejectUser(ydoc, 'bad-user');

      const updatedAt = map.get('updatedAt') as number;
      expect(updatedAt).toBeGreaterThanOrEqual(before);
    });
  });

  describe('getPlanOwnerId', () => {
    it('returns null for new doc', () => {
      expect(getPlanOwnerId(ydoc)).toBe(null);
    });

    it('returns ownerId when set', () => {
      const map = ydoc.getMap('metadata');
      map.set('ownerId', 'owner123');
      expect(getPlanOwnerId(ydoc)).toBe('owner123');
    });

    it('returns null when ownerId is not a string', () => {
      const map = ydoc.getMap('metadata');
      map.set('ownerId', 123);
      expect(getPlanOwnerId(ydoc)).toBe(null);
    });
  });

  describe('isApprovalRequired', () => {
    it('returns false for new doc without owner', () => {
      expect(isApprovalRequired(ydoc)).toBe(false);
    });

    it('returns true when ownerId is set (default behavior)', () => {
      const map = ydoc.getMap('metadata');
      map.set('ownerId', 'owner1');
      expect(isApprovalRequired(ydoc)).toBe(true);
    });

    it('respects explicit approvalRequired=false', () => {
      const map = ydoc.getMap('metadata');
      map.set('ownerId', 'owner1');
      map.set('approvalRequired', false);
      expect(isApprovalRequired(ydoc)).toBe(false);
    });

    it('respects explicit approvalRequired=true', () => {
      const map = ydoc.getMap('metadata');
      map.set('approvalRequired', true);
      expect(isApprovalRequired(ydoc)).toBe(true);
    });
  });
});

describe('PR linking helpers', () => {
  let ydoc: Y.Doc;

  const createPR = (prNumber: number, overrides?: Partial<LinkedPR>): LinkedPR => ({
    prNumber,
    url: `https://github.com/org/repo/pull/${prNumber}`,
    linkedAt: Date.now(),
    status: 'open',
    ...overrides,
  });

  beforeEach(() => {
    ydoc = new Y.Doc();
  });

  describe('getLinkedPRs', () => {
    it('returns empty array for new doc', () => {
      expect(getLinkedPRs(ydoc)).toEqual([]);
    });

    it('returns linked PRs', () => {
      const pr1 = createPR(1);
      const pr2 = createPR(2, { status: 'merged' });

      linkPR(ydoc, pr1);
      linkPR(ydoc, pr2);

      const prs = getLinkedPRs(ydoc);
      expect(prs).toHaveLength(2);
      expect(prs[0]?.prNumber).toBe(1);
      expect(prs[1]?.prNumber).toBe(2);
    });

    it('filters out invalid entries', () => {
      const array = ydoc.getArray('linkedPRs');

      array.push([createPR(1)]);

      array.push([{ prNumber: 2 }]);
      array.push([null]);

      const prs = getLinkedPRs(ydoc);
      expect(prs).toHaveLength(1);
      expect(prs[0]?.prNumber).toBe(1);
    });
  });

  describe('linkPR', () => {
    it('adds PR to linkedPRs', () => {
      const pr = createPR(42, { title: 'Fix bug' });
      linkPR(ydoc, pr);

      const prs = getLinkedPRs(ydoc);
      expect(prs).toHaveLength(1);
      expect(prs[0]?.prNumber).toBe(42);
      expect(prs[0]?.title).toBe('Fix bug');
    });

    it('replaces existing PR with same number', () => {
      const pr1 = createPR(42, { status: 'open', title: 'Old title' });
      const pr2 = createPR(42, { status: 'merged', title: 'New title' });

      linkPR(ydoc, pr1);
      linkPR(ydoc, pr2);

      const prs = getLinkedPRs(ydoc);
      expect(prs).toHaveLength(1);
      expect(prs[0]?.status).toBe('merged');
      expect(prs[0]?.title).toBe('New title');
    });

    it('can link multiple different PRs', () => {
      linkPR(ydoc, createPR(1));
      linkPR(ydoc, createPR(2));
      linkPR(ydoc, createPR(3));

      expect(getLinkedPRs(ydoc)).toHaveLength(3);
    });
  });

  describe('unlinkPR', () => {
    it('returns false when PR does not exist', () => {
      expect(unlinkPR(ydoc, 999)).toBe(false);
    });

    it('removes PR and returns true', () => {
      linkPR(ydoc, createPR(1));
      linkPR(ydoc, createPR(2));

      expect(unlinkPR(ydoc, 1)).toBe(true);

      const prs = getLinkedPRs(ydoc);
      expect(prs).toHaveLength(1);
      expect(prs[0]?.prNumber).toBe(2);
    });

    it('returns false for empty array', () => {
      expect(unlinkPR(ydoc, 1)).toBe(false);
    });
  });

  describe('getLinkedPR', () => {
    it('returns null when PR does not exist', () => {
      expect(getLinkedPR(ydoc, 999)).toBe(null);
    });

    it('returns the PR when it exists', () => {
      const pr = createPR(42, { title: 'My PR', branch: 'feature/test' });
      linkPR(ydoc, pr);

      const result = getLinkedPR(ydoc, 42);
      expect(result).not.toBe(null);
      expect(result?.prNumber).toBe(42);
      expect(result?.title).toBe('My PR');
      expect(result?.branch).toBe('feature/test');
    });

    it('finds correct PR among multiple', () => {
      linkPR(ydoc, createPR(1, { title: 'PR 1' }));
      linkPR(ydoc, createPR(2, { title: 'PR 2' }));
      linkPR(ydoc, createPR(3, { title: 'PR 3' }));

      expect(getLinkedPR(ydoc, 2)?.title).toBe('PR 2');
    });
  });

  describe('updateLinkedPRStatus', () => {
    it('returns false when PR does not exist', () => {
      expect(updateLinkedPRStatus(ydoc, 999, 'merged')).toBe(false);
    });

    it('updates PR status and returns true', () => {
      linkPR(ydoc, createPR(42, { status: 'open' }));

      expect(updateLinkedPRStatus(ydoc, 42, 'merged')).toBe(true);
      expect(getLinkedPR(ydoc, 42)?.status).toBe('merged');
    });

    it('preserves other PR fields when updating status', () => {
      linkPR(ydoc, createPR(42, { title: 'My PR', branch: 'main', status: 'draft' }));

      updateLinkedPRStatus(ydoc, 42, 'open');

      const pr = getLinkedPR(ydoc, 42);
      expect(pr?.status).toBe('open');
      expect(pr?.title).toBe('My PR');
      expect(pr?.branch).toBe('main');
    });

    it('handles all valid status values', () => {
      const statuses: LinkedPR['status'][] = ['draft', 'open', 'merged', 'closed'];

      for (const status of statuses) {
        linkPR(ydoc, createPR(1, { status: 'draft' }));
        updateLinkedPRStatus(ydoc, 1, status);
        expect(getLinkedPR(ydoc, 1)?.status).toBe(status);
      }
    });
  });

  describe('linkPR validation', () => {
    it('rejects invalid PR (missing required fields)', () => {
      const invalidPR = {
        prNumber: 42,
      } as LinkedPR;

      expect(() => linkPR(ydoc, invalidPR)).toThrow();
    });

    it('rejects PR with invalid status', () => {
      const invalidPR = {
        prNumber: 42,
        url: 'https://github.com/test/repo/pull/42',
        status: 'invalid-status' as LinkedPR['status'],
        branch: 'feature',
        title: 'Test',
        linkedAt: Date.now(),
      };

      expect(() => linkPR(ydoc, invalidPR)).toThrow();
    });

    it('accepts valid PR data', () => {
      const validPR: LinkedPR = {
        prNumber: 42,
        url: 'https://github.com/test/repo/pull/42',
        linkedAt: Date.now(),
        status: 'open',
        branch: 'feature',
        title: 'Test PR',
      };

      expect(() => linkPR(ydoc, validPR)).not.toThrow();
      expect(getLinkedPRs(ydoc)).toHaveLength(1);
    });
  });
});

describe('Deliverables helpers', () => {
  let ydoc: Y.Doc;

  const createDeliverable = (
    id: string,
    text: string,
    overrides?: Partial<Deliverable>
  ): Deliverable => ({
    id,
    text,
    ...overrides,
  });

  beforeEach(() => {
    ydoc = new Y.Doc();
  });

  describe('getDeliverables', () => {
    it('returns empty array for new doc', () => {
      expect(getDeliverables(ydoc)).toEqual([]);
    });

    it('returns deliverables', () => {
      addDeliverable(ydoc, createDeliverable('del-1', 'Screenshot of login'));
      addDeliverable(ydoc, createDeliverable('del-2', 'Video demo'));

      const deliverables = getDeliverables(ydoc);
      expect(deliverables).toHaveLength(2);
      expect(deliverables[0]?.text).toBe('Screenshot of login');
      expect(deliverables[1]?.text).toBe('Video demo');
    });

    it('filters out invalid entries', () => {
      const array = ydoc.getArray('deliverables');

      array.push([createDeliverable('del-1', 'Valid')]);

      array.push([{ id: 'del-2' }]);
      array.push([{ text: 'No ID' }]);
      array.push([null]);

      const deliverables = getDeliverables(ydoc);
      expect(deliverables).toHaveLength(1);
      expect(deliverables[0]?.id).toBe('del-1');
    });
  });

  describe('addDeliverable', () => {
    it('adds deliverable to array', () => {
      const deliverable = createDeliverable('del-1', 'Test deliverable');
      addDeliverable(ydoc, deliverable);

      const deliverables = getDeliverables(ydoc);
      expect(deliverables).toHaveLength(1);
      expect(deliverables[0]).toEqual(deliverable);
    });

    it('can add multiple deliverables', () => {
      addDeliverable(ydoc, createDeliverable('del-1', 'First'));
      addDeliverable(ydoc, createDeliverable('del-2', 'Second'));
      addDeliverable(ydoc, createDeliverable('del-3', 'Third'));

      expect(getDeliverables(ydoc)).toHaveLength(3);
    });

    it('preserves order of deliverables', () => {
      addDeliverable(ydoc, createDeliverable('a', 'First'));
      addDeliverable(ydoc, createDeliverable('b', 'Second'));
      addDeliverable(ydoc, createDeliverable('c', 'Third'));

      const deliverables = getDeliverables(ydoc);
      expect(deliverables.map((d) => d.id)).toEqual(['a', 'b', 'c']);
    });
  });

  describe('linkArtifactToDeliverable', () => {
    it('returns false when deliverable does not exist', () => {
      expect(linkArtifactToDeliverable(ydoc, 'nonexistent', 'art-1')).toBe(false);
    });

    it('links artifact to deliverable and returns true', () => {
      addDeliverable(ydoc, createDeliverable('del-1', 'Screenshot'));

      const before = Date.now();
      expect(linkArtifactToDeliverable(ydoc, 'del-1', 'art-123')).toBe(true);

      const deliverables = getDeliverables(ydoc);
      expect(deliverables[0]?.linkedArtifactId).toBe('art-123');
      expect(deliverables[0]?.linkedAt).toBeGreaterThanOrEqual(before);
    });

    it('preserves other deliverable fields', () => {
      addDeliverable(ydoc, createDeliverable('del-1', 'My deliverable text'));

      linkArtifactToDeliverable(ydoc, 'del-1', 'art-1');

      const deliverable = getDeliverables(ydoc)[0];
      expect(deliverable?.id).toBe('del-1');
      expect(deliverable?.text).toBe('My deliverable text');
      expect(deliverable?.linkedArtifactId).toBe('art-1');
    });

    it('can update artifact link on same deliverable', () => {
      addDeliverable(ydoc, createDeliverable('del-1', 'Test'));

      linkArtifactToDeliverable(ydoc, 'del-1', 'art-1');
      linkArtifactToDeliverable(ydoc, 'del-1', 'art-2');

      expect(getDeliverables(ydoc)[0]?.linkedArtifactId).toBe('art-2');
    });

    it('links correct deliverable among multiple', () => {
      addDeliverable(ydoc, createDeliverable('del-1', 'First'));
      addDeliverable(ydoc, createDeliverable('del-2', 'Second'));
      addDeliverable(ydoc, createDeliverable('del-3', 'Third'));

      linkArtifactToDeliverable(ydoc, 'del-2', 'art-middle');

      const deliverables = getDeliverables(ydoc);
      expect(deliverables[0]?.linkedArtifactId).toBeUndefined();
      expect(deliverables[1]?.linkedArtifactId).toBe('art-middle');
      expect(deliverables[2]?.linkedArtifactId).toBeUndefined();
    });
  });
});

describe('Plan metadata helpers', () => {
  let ydoc: Y.Doc;

  beforeEach(() => {
    ydoc = new Y.Doc();
  });

  describe('getPlanMetadata', () => {
    it('returns null for new doc', () => {
      expect(getPlanMetadata(ydoc)).toBe(null);
    });

    it('returns null for invalid metadata', () => {
      const map = ydoc.getMap('metadata');
      map.set('id', 'plan-1');
      expect(getPlanMetadata(ydoc)).toBe(null);
    });

    it('returns metadata when valid', () => {
      const map = ydoc.getMap('metadata');
      const now = Date.now();
      map.set('id', 'plan-1');
      map.set('title', 'Test Plan');
      map.set('status', 'draft');
      map.set('createdAt', now);
      map.set('updatedAt', now);

      const metadata = getPlanMetadata(ydoc);
      expect(metadata).not.toBe(null);
      expect(metadata?.id).toBe('plan-1');
      expect(metadata?.title).toBe('Test Plan');
      expect(metadata?.status).toBe('draft');
    });

    it('includes optional fields when present', () => {
      const map = ydoc.getMap('metadata');
      const now = Date.now();
      map.set('id', 'plan-1');
      map.set('title', 'Test Plan');
      map.set('status', 'pending_review');
      map.set('reviewRequestId', 'req-123');
      map.set('createdAt', now);
      map.set('updatedAt', now);
      map.set('repo', 'org/repo');
      map.set('pr', 42);
      map.set('ownerId', 'owner1');

      const metadata = getPlanMetadata(ydoc);
      expect(metadata?.repo).toBe('org/repo');
      expect(metadata?.pr).toBe(42);
      expect(metadata?.ownerId).toBe('owner1');
    });
  });

  describe('setPlanMetadata', () => {
    it('sets metadata fields', () => {
      setPlanMetadata(ydoc, { title: 'New Title', repo: 'org/repo' });

      const map = ydoc.getMap('metadata');
      expect(map.get('title')).toBe('New Title');
      expect(map.get('repo')).toBe('org/repo');
    });

    it('updates updatedAt timestamp', () => {
      const before = Date.now();
      setPlanMetadata(ydoc, { title: 'Test' });

      const map = ydoc.getMap('metadata');
      const updatedAt = map.get('updatedAt') as number;
      expect(updatedAt).toBeGreaterThanOrEqual(before);
    });

    it('ignores undefined values', () => {
      const map = ydoc.getMap('metadata');
      map.set('title', 'Original');
      map.set('repo', 'original/repo');

      setPlanMetadata(ydoc, { title: undefined, repo: 'new/repo' });

      expect(map.get('title')).toBe('Original');
      expect(map.get('repo')).toBe('new/repo');
    });

    it('can update partial metadata', () => {
      const map = ydoc.getMap('metadata');
      map.set('id', 'plan-1');
      map.set('title', 'Original Title');
      map.set('repo', 'original/repo');

      setPlanMetadata(ydoc, { repo: 'new/repo' });

      expect(map.get('title')).toBe('Original Title');
      expect(map.get('repo')).toBe('new/repo');
    });
  });

  describe('initPlanMetadata', () => {
    it('initializes all required fields', () => {
      const before = Date.now();

      initPlanMetadata(ydoc, {
        id: 'plan-1',
        title: 'My Plan',
      });

      const map = ydoc.getMap('metadata');
      expect(map.get('id')).toBe('plan-1');
      expect(map.get('title')).toBe('My Plan');
      expect(map.get('status')).toBe('draft');
      expect(map.get('createdAt')).toBeGreaterThanOrEqual(before);
      expect(map.get('updatedAt')).toBeGreaterThanOrEqual(before);
    });

    it('sets createdAt and updatedAt to same value', () => {
      initPlanMetadata(ydoc, {
        id: 'plan-1',
        title: 'Test',
      });

      const map = ydoc.getMap('metadata');
      expect(map.get('createdAt')).toBe(map.get('updatedAt'));
    });

    it('sets optional repo and pr when provided', () => {
      initPlanMetadata(ydoc, {
        id: 'plan-1',
        title: 'Test',
        repo: 'org/repo',
        pr: 123,
      });

      const map = ydoc.getMap('metadata');
      expect(map.get('repo')).toBe('org/repo');
      expect(map.get('pr')).toBe(123);
    });

    it('sets ownerId and adds owner to approvedUsers', () => {
      initPlanMetadata(ydoc, {
        id: 'plan-1',
        title: 'Test',
        ownerId: 'owner-user',
      });

      const map = ydoc.getMap('metadata');
      expect(map.get('ownerId')).toBe('owner-user');
      expect(map.get('approvedUsers')).toEqual(['owner-user']);
    });

    it('sets approvalRequired to true by default when ownerId is set', () => {
      initPlanMetadata(ydoc, {
        id: 'plan-1',
        title: 'Test',
        ownerId: 'owner-user',
      });

      const map = ydoc.getMap('metadata');
      expect(map.get('approvalRequired')).toBe(true);
    });

    it('respects explicit approvalRequired=false', () => {
      initPlanMetadata(ydoc, {
        id: 'plan-1',
        title: 'Test',
        ownerId: 'owner-user',
        approvalRequired: false,
      });

      const map = ydoc.getMap('metadata');
      expect(map.get('approvalRequired')).toBe(false);
    });

    it('sets sessionTokenHash when provided', () => {
      initPlanMetadata(ydoc, {
        id: 'plan-1',
        title: 'Test',
        sessionTokenHash: 'hash123',
      });

      const map = ydoc.getMap('metadata');
      expect(map.get('sessionTokenHash')).toBe('hash123');
    });

    it('sets origin metadata when provided', () => {
      initPlanMetadata(ydoc, {
        id: 'plan-1',
        title: 'Test',
        origin: {
          platform: 'claude-code',
          sessionId: 'session-123',
          transcriptPath: '/path/to/transcript',
        },
      });

      const map = ydoc.getMap('metadata');
      const origin = map.get('origin') as { platform: string; sessionId: string };
      expect(origin.platform).toBe('claude-code');
      expect(origin.sessionId).toBe('session-123');
    });

    describe('initPlanMetadata validation', () => {
      it('validates metadata after initialization', () => {
        expect(() =>
          initPlanMetadata(ydoc, {
            id: 'plan-1',
            title: 'Valid Plan',
          })
        ).not.toThrow();

        const metadata = getPlanMetadata(ydoc);
        expect(metadata).not.toBeNull();
        expect(metadata?.id).toBe('plan-1');
      });

      it('ensures initialized metadata is valid PlanMetadata', () => {
        initPlanMetadata(ydoc, {
          id: 'plan-1',
          title: 'Test Plan',
          ownerId: 'owner-123',
        });

        const result = getPlanMetadataWithValidation(ydoc);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.status).toBe('draft');
          expect(result.data.id).toBe('plan-1');
          expect(result.data.ownerId).toBe('owner-123');
        }
      });

      it('throws if metadata becomes invalid during initialization', () => {
        const map = ydoc.getMap('metadata');
        map.set('id', 'corrupt-plan');
        map.set('title', 'Corrupt');

        expect(() =>
          initPlanMetadata(ydoc, {
            id: 'plan-1',
            title: 'Test',
          })
        ).not.toThrow();

        const result = getPlanMetadataWithValidation(ydoc);
        expect(result.success).toBe(true);
      });
    });
  });
});

describe('transitionPlanStatus', () => {
  let ydoc: Y.Doc;

  beforeEach(() => {
    ydoc = new Y.Doc();
    initPlanMetadata(ydoc, {
      id: 'test-plan',
      title: 'Test Plan',
    });
  });

  describe('valid transitions', () => {
    it('should transition from draft to pending_review', () => {
      const result = transitionPlanStatus(
        ydoc,
        { status: 'pending_review', reviewRequestId: 'req-123' },
        'test-actor'
      );
      expect(result.success).toBe(true);

      const metadata = getPlanMetadata(ydoc);
      expect(metadata?.status).toBe('pending_review');
    });

    it('should transition from pending_review to in_progress with reviewer info', () => {
      transitionPlanStatus(
        ydoc,
        { status: 'pending_review', reviewRequestId: 'req-123' },
        'actor1'
      );

      const beforeTime = Date.now();
      const result = transitionPlanStatus(
        ydoc,
        { status: 'in_progress', reviewedAt: beforeTime, reviewedBy: 'reviewer1' },
        'actor1'
      );

      expect(result.success).toBe(true);
      const metadata = getPlanMetadata(ydoc);
      expect(metadata?.status).toBe('in_progress');
      if (metadata?.status === 'in_progress') {
        expect(metadata.reviewedAt).toBe(beforeTime);
        expect(metadata.reviewedBy).toBe('reviewer1');
      }
    });

    it('should transition from pending_review to changes_requested', () => {
      transitionPlanStatus(
        ydoc,
        { status: 'pending_review', reviewRequestId: 'req-123' },
        'actor1'
      );

      const result = transitionPlanStatus(
        ydoc,
        { status: 'changes_requested', reviewedAt: Date.now(), reviewedBy: 'reviewer1' },
        'actor1'
      );

      expect(result.success).toBe(true);
      const metadata = getPlanMetadata(ydoc);
      expect(metadata?.status).toBe('changes_requested');
    });

    it('should transition from changes_requested to in_progress', () => {
      transitionPlanStatus(
        ydoc,
        { status: 'pending_review', reviewRequestId: 'req-123' },
        'actor1'
      );
      transitionPlanStatus(
        ydoc,
        { status: 'changes_requested', reviewedAt: Date.now(), reviewedBy: 'reviewer1' },
        'actor1'
      );

      const result = transitionPlanStatus(
        ydoc,
        { status: 'in_progress', reviewedAt: Date.now(), reviewedBy: 'reviewer1' },
        'actor1'
      );

      expect(result.success).toBe(true);
      const metadata = getPlanMetadata(ydoc);
      expect(metadata?.status).toBe('in_progress');
    });

    it('should transition from in_progress to completed', () => {
      transitionPlanStatus(
        ydoc,
        { status: 'pending_review', reviewRequestId: 'req-123' },
        'actor1'
      );
      transitionPlanStatus(
        ydoc,
        { status: 'in_progress', reviewedAt: Date.now(), reviewedBy: 'reviewer1' },
        'actor1'
      );

      const result = transitionPlanStatus(
        ydoc,
        { status: 'completed', completedAt: Date.now(), completedBy: 'actor1' },
        'actor1'
      );

      expect(result.success).toBe(true);
      const metadata = getPlanMetadata(ydoc);
      expect(metadata?.status).toBe('completed');
    });
  });

  describe('flexible transitions (all allowed)', () => {
    it('should allow transition from draft to completed', () => {
      const now = Date.now();
      const result = transitionPlanStatus(
        ydoc,
        { status: 'completed', completedAt: now, completedBy: 'actor' },
        'test-actor'
      );

      expect(result.success).toBe(true);

      const metadata = getPlanMetadata(ydoc);
      expect(metadata?.status).toBe('completed');
      if (metadata?.status === 'completed') {
        expect(metadata.completedAt).toBe(now);
        expect(metadata.completedBy).toBe('actor');
      }
    });

    it('should allow transition from draft to changes_requested', () => {
      const now = Date.now();
      const result = transitionPlanStatus(
        ydoc,
        { status: 'changes_requested', reviewedAt: now, reviewedBy: 'actor' },
        'test-actor'
      );

      expect(result.success).toBe(true);
      const metadata = getPlanMetadata(ydoc);
      expect(metadata?.status).toBe('changes_requested');
    });

    it('should allow transition from completed to in_progress', () => {
      transitionPlanStatus(
        ydoc,
        { status: 'completed', completedAt: Date.now(), completedBy: 'actor1' },
        'actor1'
      );

      const now = Date.now();
      const result = transitionPlanStatus(
        ydoc,
        { status: 'in_progress', reviewedAt: now, reviewedBy: 'actor1' },
        'actor1'
      );

      expect(result.success).toBe(true);
      const metadata = getPlanMetadata(ydoc);
      expect(metadata?.status).toBe('in_progress');
    });

    it('should allow transition from completed to draft', () => {
      transitionPlanStatus(
        ydoc,
        { status: 'completed', completedAt: Date.now(), completedBy: 'actor1' },
        'actor1'
      );

      const result = transitionPlanStatus(ydoc, { status: 'draft' }, 'actor1');

      expect(result.success).toBe(true);
      const metadata = getPlanMetadata(ydoc);
      expect(metadata?.status).toBe('draft');
    });

    it('should allow transition from in_progress to draft', () => {
      transitionPlanStatus(
        ydoc,
        { status: 'in_progress', reviewedAt: Date.now(), reviewedBy: 'reviewer1' },
        'actor1'
      );

      const result = transitionPlanStatus(ydoc, { status: 'draft' }, 'actor1');

      expect(result.success).toBe(true);
      const metadata = getPlanMetadata(ydoc);
      expect(metadata?.status).toBe('draft');
    });

    it('should allow transition from pending_review to draft', () => {
      transitionPlanStatus(
        ydoc,
        { status: 'pending_review', reviewRequestId: 'req-123' },
        'actor1'
      );

      const result = transitionPlanStatus(ydoc, { status: 'draft' }, 'actor1');

      expect(result.success).toBe(true);
      const metadata = getPlanMetadata(ydoc);
      expect(metadata?.status).toBe('draft');
    });
  });

  describe('draft transition clears status-specific fields', () => {
    it('should clear completed fields when transitioning to draft', () => {
      transitionPlanStatus(
        ydoc,
        {
          status: 'completed',
          completedAt: Date.now(),
          completedBy: 'completer1',
          snapshotUrl: 'https://example.com/snapshot',
        },
        'actor1'
      );

      let metadata = getPlanMetadata(ydoc);
      expect(metadata?.status).toBe('completed');
      if (metadata?.status === 'completed') {
        expect(metadata.completedAt).toBeDefined();
        expect(metadata.completedBy).toBe('completer1');
      }

      transitionPlanStatus(ydoc, { status: 'draft' }, 'actor1');

      metadata = getPlanMetadata(ydoc);
      expect(metadata?.status).toBe('draft');
      const map = ydoc.getMap('metadata');
      expect(map.get('completedAt')).toBeUndefined();
      expect(map.get('completedBy')).toBeUndefined();
      expect(map.get('snapshotUrl')).toBeUndefined();
    });

    it('should clear review fields when transitioning to draft', () => {
      transitionPlanStatus(
        ydoc,
        {
          status: 'changes_requested',
          reviewedAt: Date.now(),
          reviewedBy: 'reviewer1',
          reviewComment: 'Needs work',
        },
        'actor1'
      );

      transitionPlanStatus(ydoc, { status: 'draft' }, 'actor1');

      const map = ydoc.getMap('metadata');
      expect(map.get('reviewedAt')).toBeUndefined();
      expect(map.get('reviewedBy')).toBeUndefined();
      expect(map.get('reviewComment')).toBeUndefined();
    });

    it('should clear reviewRequestId when transitioning to draft from pending_review', () => {
      transitionPlanStatus(
        ydoc,
        { status: 'pending_review', reviewRequestId: 'req-123' },
        'actor1'
      );

      transitionPlanStatus(ydoc, { status: 'draft' }, 'actor1');

      const map = ydoc.getMap('metadata');
      expect(map.get('reviewRequestId')).toBeUndefined();
    });
  });

  describe('edge cases', () => {
    it('should handle missing metadata', () => {
      const emptyDoc = new Y.Doc();
      const result = transitionPlanStatus(
        emptyDoc,
        { status: 'pending_review', reviewRequestId: 'req-123' },
        'test-actor'
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('No metadata found in Y.Doc');
      }
    });

    it('should reject transition to same status (no-op not allowed)', () => {
      transitionPlanStatus(
        ydoc,
        { status: 'pending_review', reviewRequestId: 'req-123' },
        'test-actor'
      );

      const result = transitionPlanStatus(
        ydoc,
        { status: 'pending_review', reviewRequestId: 'req-456' },
        'test-actor'
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Invalid transition');
      }
      const metadata = getPlanMetadata(ydoc);
      expect(metadata?.status).toBe('pending_review');
    });
  });

  describe('metadata updates', () => {
    it('should always update updatedAt timestamp', () => {
      const before = Date.now();
      transitionPlanStatus(
        ydoc,
        { status: 'pending_review', reviewRequestId: 'req-123' },
        'actor1'
      );

      const metadata = getPlanMetadata(ydoc);
      expect(metadata?.updatedAt).toBeGreaterThanOrEqual(before);
    });

    it('should set completedAt and completedBy when transitioning to completed', () => {
      transitionPlanStatus(
        ydoc,
        { status: 'pending_review', reviewRequestId: 'req-123' },
        'actor1'
      );
      transitionPlanStatus(
        ydoc,
        { status: 'in_progress', reviewedAt: Date.now(), reviewedBy: 'reviewer1' },
        'actor1'
      );

      const completedTime = Date.now();
      transitionPlanStatus(
        ydoc,
        { status: 'completed', completedAt: completedTime, completedBy: 'completer1' },
        'actor1'
      );

      const metadata = getPlanMetadata(ydoc);
      if (metadata?.status === 'completed') {
        expect(metadata.completedAt).toBe(completedTime);
        expect(metadata.completedBy).toBe('completer1');
      }
    });
  });
});

describe('Change Snapshot helpers', () => {
  let ydoc: Y.Doc;

  const createSnapshot = (
    machineId: string,
    overrides?: Partial<ChangeSnapshot>
  ): ChangeSnapshot => ({
    machineId,
    machineName: `Machine ${machineId}`,
    ownerId: 'test-user',
    headSha: 'abc123',
    branch: 'main',
    isLive: true,
    updatedAt: Date.now(),
    files: [],
    totalAdditions: 0,
    totalDeletions: 0,
    ...overrides,
  });

  beforeEach(() => {
    ydoc = new Y.Doc();
  });

  it('getChangeSnapshots returns empty Map for new doc', () => {
    const snapshots = getChangeSnapshots(ydoc);
    expect(snapshots.size).toBe(0);
  });

  it('setChangeSnapshot adds snapshot', () => {
    const snapshot = createSnapshot('machine-1');

    setChangeSnapshot(ydoc, snapshot);

    const snapshots = getChangeSnapshots(ydoc);
    expect(snapshots.size).toBe(1);
    expect(snapshots.get('machine-1')).toMatchObject({
      machineId: 'machine-1',
      machineName: 'Machine machine-1',
      ownerId: 'test-user',
    });
  });

  it('getChangeSnapshot retrieves specific snapshot', () => {
    const snapshot1 = createSnapshot('machine-1', { machineName: 'First' });
    const snapshot2 = createSnapshot('machine-2', { machineName: 'Second' });

    setChangeSnapshot(ydoc, snapshot1);
    setChangeSnapshot(ydoc, snapshot2);

    const retrieved = getChangeSnapshot(ydoc, 'machine-2');
    expect(retrieved).not.toBe(null);
    expect(retrieved?.machineName).toBe('Second');
  });

  it('getChangeSnapshot returns null for non-existent machineId', () => {
    const result = getChangeSnapshot(ydoc, 'nonexistent');
    expect(result).toBe(null);
  });

  it('markMachineDisconnected sets isLive to false', () => {
    const snapshot = createSnapshot('machine-1', { isLive: true });
    setChangeSnapshot(ydoc, snapshot);

    const result = markMachineDisconnected(ydoc, 'machine-1');

    expect(result).toBe(true);
    const updated = getChangeSnapshot(ydoc, 'machine-1');
    expect(updated?.isLive).toBe(false);
  });

  it('markMachineDisconnected returns false for non-existent machine', () => {
    const result = markMachineDisconnected(ydoc, 'nonexistent');
    expect(result).toBe(false);
  });

  it('markMachineDisconnected preserves other snapshot fields', () => {
    const snapshot = createSnapshot('machine-1', {
      branch: 'feature/test',
      files: [{ path: 'file.ts', status: 'modified', patch: '', staged: false }],
      totalAdditions: 10,
      totalDeletions: 5,
    });
    setChangeSnapshot(ydoc, snapshot);

    markMachineDisconnected(ydoc, 'machine-1');

    const updated = getChangeSnapshot(ydoc, 'machine-1');
    expect(updated?.branch).toBe('feature/test');
    expect(updated?.files).toHaveLength(1);
    expect(updated?.totalAdditions).toBe(10);
    expect(updated?.totalDeletions).toBe(5);
  });

  it('removeChangeSnapshot deletes entry', () => {
    const snapshot = createSnapshot('machine-1');
    setChangeSnapshot(ydoc, snapshot);

    const result = removeChangeSnapshot(ydoc, 'machine-1');

    expect(result).toBe(true);
    expect(getChangeSnapshots(ydoc).size).toBe(0);
  });

  it('removeChangeSnapshot returns false for non-existent entry', () => {
    const result = removeChangeSnapshot(ydoc, 'nonexistent');
    expect(result).toBe(false);
  });

  it('setChangeSnapshot overwrites existing snapshot for same machineId', () => {
    const snapshot1 = createSnapshot('machine-1', { branch: 'main' });
    const snapshot2 = createSnapshot('machine-1', { branch: 'develop' });

    setChangeSnapshot(ydoc, snapshot1);
    setChangeSnapshot(ydoc, snapshot2);

    const snapshots = getChangeSnapshots(ydoc);
    expect(snapshots.size).toBe(1);
    expect(snapshots.get('machine-1')?.branch).toBe('develop');
  });

  it('can store multiple snapshots from different machines', () => {
    setChangeSnapshot(ydoc, createSnapshot('machine-1'));
    setChangeSnapshot(ydoc, createSnapshot('machine-2'));
    setChangeSnapshot(ydoc, createSnapshot('machine-3'));

    const snapshots = getChangeSnapshots(ydoc);
    expect(snapshots.size).toBe(3);
    expect(snapshots.has('machine-1')).toBe(true);
    expect(snapshots.has('machine-2')).toBe(true);
    expect(snapshots.has('machine-3')).toBe(true);
  });
});
