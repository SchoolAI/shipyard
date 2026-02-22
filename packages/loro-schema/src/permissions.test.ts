import { describe, expect, it } from 'vitest';
import { buildDocumentId } from './epoch.js';
import { buildShipyardPermissions } from './permissions.js';

const EPOCH = 2;

function metaDocId(taskId: string) {
  return buildDocumentId('task-meta', taskId, EPOCH);
}

function convDocId(taskId: string) {
  return buildDocumentId('task-conv', taskId, EPOCH);
}

function reviewDocId(taskId: string) {
  return buildDocumentId('task-review', taskId, EPOCH);
}

function roomDocId(userId: string) {
  return buildDocumentId('room', userId, EPOCH);
}

const storagePeer = { channelKind: 'storage' };
const networkPeer = { channelKind: 'network' };
const doc = (id: string) => ({ id });

describe('buildShipyardPermissions', () => {
  describe('owner role', () => {
    const perms = buildShipyardPermissions('owner');

    it('allows all writes from network peers', () => {
      expect(perms.mutability(doc(metaDocId('t1')), networkPeer)).toBe(true);
      expect(perms.mutability(doc(convDocId('t1')), networkPeer)).toBe(true);
      expect(perms.mutability(doc(reviewDocId('t1')), networkPeer)).toBe(true);
    });

    it('allows all writes from storage', () => {
      expect(perms.mutability(doc(metaDocId('t1')), storagePeer)).toBe(true);
    });
  });

  describe('collaborator-full role', () => {
    const perms = buildShipyardPermissions('collaborator-full');

    it('blocks meta writes from network peers', () => {
      expect(perms.mutability(doc(metaDocId('t1')), networkPeer)).toBe(false);
    });

    it('allows conv writes from network peers', () => {
      expect(perms.mutability(doc(convDocId('t1')), networkPeer)).toBe(true);
    });

    it('allows review writes from network peers', () => {
      expect(perms.mutability(doc(reviewDocId('t1')), networkPeer)).toBe(true);
    });

    it('denies unknown-prefix docs from network peers', () => {
      expect(perms.mutability(doc(roomDocId('u1')), networkPeer)).toBe(false);
    });

    it('always allows storage writes', () => {
      expect(perms.mutability(doc(metaDocId('t1')), storagePeer)).toBe(true);
    });
  });

  describe('collaborator-review role', () => {
    const perms = buildShipyardPermissions('collaborator-review');

    it('blocks meta writes from network peers', () => {
      expect(perms.mutability(doc(metaDocId('t1')), networkPeer)).toBe(false);
    });

    it('blocks conv writes from network peers', () => {
      expect(perms.mutability(doc(convDocId('t1')), networkPeer)).toBe(false);
    });

    it('allows review writes from network peers', () => {
      expect(perms.mutability(doc(reviewDocId('t1')), networkPeer)).toBe(true);
    });

    it('denies unknown-prefix docs from network peers', () => {
      expect(perms.mutability(doc(roomDocId('u1')), networkPeer)).toBe(false);
    });
  });

  describe('viewer role', () => {
    const perms = buildShipyardPermissions('viewer');

    it('blocks all task doc writes from network peers', () => {
      expect(perms.mutability(doc(metaDocId('t1')), networkPeer)).toBe(false);
      expect(perms.mutability(doc(convDocId('t1')), networkPeer)).toBe(false);
      expect(perms.mutability(doc(reviewDocId('t1')), networkPeer)).toBe(false);
    });

    it('denies writes for non-task docs (fail-closed)', () => {
      expect(perms.mutability(doc(roomDocId('u1')), networkPeer)).toBe(false);
    });

    it('always allows storage writes', () => {
      expect(perms.mutability(doc(metaDocId('t1')), storagePeer)).toBe(true);
    });
  });

  describe('unparseable doc IDs', () => {
    it('denies bare epoch string for non-owner roles', () => {
      const perms = buildShipyardPermissions('collaborator-full');
      expect(perms.mutability(doc('epoch'), networkPeer)).toBe(false);
    });

    it('denies completely unparseable ID for non-owner roles', () => {
      const perms = buildShipyardPermissions('collaborator-full');
      expect(perms.mutability(doc('no-colons-here'), networkPeer)).toBe(false);
    });

    it('owner still allows unparseable IDs (owner short-circuits)', () => {
      const ownerPerms = buildShipyardPermissions('owner');
      expect(ownerPerms.mutability(doc('epoch'), networkPeer)).toBe(true);
      expect(ownerPerms.mutability(doc('no-colons-here'), networkPeer)).toBe(true);
    });
  });

  describe('visibility', () => {
    it('always returns true', () => {
      const perms = buildShipyardPermissions('viewer');
      expect(perms.visibility(doc(metaDocId('t1')), networkPeer)).toBe(true);
    });
  });

  describe('creation', () => {
    const perms = buildShipyardPermissions('owner');

    it('allows creation from storage', () => {
      expect(perms.creation('any-doc', storagePeer)).toBe(true);
    });

    it('allows creation from network peers', () => {
      expect(perms.creation('any-doc', networkPeer)).toBe(true);
    });
  });

  describe('deletion', () => {
    it('always blocks deletion', () => {
      const perms = buildShipyardPermissions('owner');
      expect(perms.deletion(doc(metaDocId('t1')), networkPeer)).toBe(false);
    });
  });
});
