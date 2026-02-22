import { describe, expect, it } from 'vitest';
import { buildDocumentId } from './epoch.js';
import {
  buildCollaboratorPermissions,
  buildDualPermissions,
  buildShipyardPermissions,
} from './permissions.js';

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

const storagePeer = { peerId: '0', channelKind: 'storage' as const };
const networkPeer = { peerId: '1', channelKind: 'network' as const };
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

describe('buildDualPermissions', () => {
  const personalPeer = { peerId: '10', channelKind: 'network' as const };
  const collabPeer = { peerId: '99', channelKind: 'other' as const };

  describe('personal adapter peer gets owner access', () => {
    const perms = buildDualPermissions('collaborator-full');

    it('allows all doc types for personal adapter peers', () => {
      expect(perms.mutability(doc(metaDocId('t1')), personalPeer)).toBe(true);
      expect(perms.mutability(doc(convDocId('t1')), personalPeer)).toBe(true);
      expect(perms.mutability(doc(reviewDocId('t1')), personalPeer)).toBe(true);
    });

    it('allows task-meta writes from daemon regardless of Loro PeerID value', () => {
      const daemonWithAnyPeerId = { peerId: '999999', channelKind: 'network' as const };
      expect(perms.mutability(doc(metaDocId('t1')), daemonWithAnyPeerId)).toBe(true);
    });
  });

  describe('channelKind is the trust anchor, not peerId', () => {
    const perms = buildDualPermissions('collaborator-full');

    it('network peers can write meta (daemon trust)', () => {
      expect(
        perms.mutability(doc(metaDocId('t1')), { peerId: 'any', channelKind: 'network' })
      ).toBe(true);
    });

    it('other peers cannot write meta (collab restriction)', () => {
      expect(perms.mutability(doc(metaDocId('t1')), { peerId: 'any', channelKind: 'other' })).toBe(
        false
      );
    });

    it('storage peers can write meta', () => {
      expect(
        perms.mutability(doc(metaDocId('t1')), { peerId: 'any', channelKind: 'storage' })
      ).toBe(true);
    });
  });

  describe('collab adapter peer with collaborator-full', () => {
    const perms = buildDualPermissions('collaborator-full');

    it('blocks meta writes', () => {
      expect(perms.mutability(doc(metaDocId('t1')), collabPeer)).toBe(false);
    });

    it('allows conv writes', () => {
      expect(perms.mutability(doc(convDocId('t1')), collabPeer)).toBe(true);
    });

    it('allows review writes', () => {
      expect(perms.mutability(doc(reviewDocId('t1')), collabPeer)).toBe(true);
    });
  });

  describe('collab adapter peer with collaborator-review', () => {
    const perms = buildDualPermissions('collaborator-review');

    it('blocks meta writes', () => {
      expect(perms.mutability(doc(metaDocId('t1')), collabPeer)).toBe(false);
    });

    it('blocks conv writes', () => {
      expect(perms.mutability(doc(convDocId('t1')), collabPeer)).toBe(false);
    });

    it('allows review writes', () => {
      expect(perms.mutability(doc(reviewDocId('t1')), collabPeer)).toBe(true);
    });
  });

  describe('collab adapter peer with viewer', () => {
    const perms = buildDualPermissions('viewer');

    it('blocks all doc types', () => {
      expect(perms.mutability(doc(metaDocId('t1')), collabPeer)).toBe(false);
      expect(perms.mutability(doc(convDocId('t1')), collabPeer)).toBe(false);
      expect(perms.mutability(doc(reviewDocId('t1')), collabPeer)).toBe(false);
    });
  });

  describe('storage channel always allowed', () => {
    const perms = buildDualPermissions('viewer');

    it('allows storage writes regardless of adapter', () => {
      expect(perms.mutability(doc(metaDocId('t1')), storagePeer)).toBe(true);
      expect(perms.mutability(doc(convDocId('t1')), storagePeer)).toBe(true);
      expect(perms.mutability(doc(reviewDocId('t1')), storagePeer)).toBe(true);
    });
  });

  describe('mutability scoped to sharedTaskIds for collab peers', () => {
    it('allows conv writes only for shared tasks', () => {
      const sharedTaskIds = new Set(['t1']);
      const perms = buildDualPermissions('collaborator-full', sharedTaskIds);

      expect(perms.mutability(doc(convDocId('t1')), collabPeer)).toBe(true);
      expect(perms.mutability(doc(convDocId('t2')), collabPeer)).toBe(false);
    });

    it('blocks meta writes even for shared tasks', () => {
      const sharedTaskIds = new Set(['t1']);
      const perms = buildDualPermissions('collaborator-full', sharedTaskIds);

      expect(perms.mutability(doc(metaDocId('t1')), collabPeer)).toBe(false);
    });

    it('blocks all writes when sharedTaskIds is empty', () => {
      const sharedTaskIds = new Set<string>();
      const perms = buildDualPermissions('collaborator-full', sharedTaskIds);

      expect(perms.mutability(doc(convDocId('t1')), collabPeer)).toBe(false);
      expect(perms.mutability(doc(reviewDocId('t1')), collabPeer)).toBe(false);
    });

    it('still allows network/storage peers regardless of sharedTaskIds', () => {
      const sharedTaskIds = new Set<string>();
      const perms = buildDualPermissions('collaborator-full', sharedTaskIds);

      expect(perms.mutability(doc(convDocId('t1')), networkPeer)).toBe(true);
      expect(perms.mutability(doc(convDocId('t1')), storagePeer)).toBe(true);
    });
  });

  describe('unparseable doc IDs denied for collab peers', () => {
    const perms = buildDualPermissions('collaborator-full');

    it('denies bare string for collab peers', () => {
      expect(perms.mutability(doc('epoch'), collabPeer)).toBe(false);
    });

    it('denies unparseable ID for collab peers', () => {
      expect(perms.mutability(doc('no-colons-here'), collabPeer)).toBe(false);
    });

    it('allows unparseable ID for personal adapter peers', () => {
      expect(perms.mutability(doc('no-colons-here'), personalPeer)).toBe(true);
    });
  });

  describe('visibility with sharedTaskIds', () => {
    it('always allows storage peers to see all docs', () => {
      const sharedTaskIds = new Set<string>();
      const perms = buildDualPermissions('collaborator-full', sharedTaskIds);
      expect(perms.visibility(doc(metaDocId('t1')), storagePeer)).toBe(true);
      expect(perms.visibility(doc(roomDocId('u1')), storagePeer)).toBe(true);
    });

    it('always allows personal adapter peers to see all docs', () => {
      const sharedTaskIds = new Set<string>();
      const perms = buildDualPermissions('collaborator-full', sharedTaskIds);
      expect(perms.visibility(doc(metaDocId('t1')), personalPeer)).toBe(true);
      expect(perms.visibility(doc(convDocId('t1')), personalPeer)).toBe(true);
      expect(perms.visibility(doc(roomDocId('u1')), personalPeer)).toBe(true);
    });

    it('blocks collab peers when sharedTaskIds is empty', () => {
      const sharedTaskIds = new Set<string>();
      const perms = buildDualPermissions('collaborator-full', sharedTaskIds);
      expect(perms.visibility(doc(metaDocId('t1')), collabPeer)).toBe(false);
      expect(perms.visibility(doc(convDocId('t1')), collabPeer)).toBe(false);
      expect(perms.visibility(doc(reviewDocId('t1')), collabPeer)).toBe(false);
      expect(perms.visibility(doc(roomDocId('u1')), collabPeer)).toBe(false);
    });

    it('allows collab peers to see docs for shared task IDs only', () => {
      const sharedTaskIds = new Set(['t1']);
      const perms = buildDualPermissions('collaborator-full', sharedTaskIds);

      expect(perms.visibility(doc(metaDocId('t1')), collabPeer)).toBe(true);
      expect(perms.visibility(doc(convDocId('t1')), collabPeer)).toBe(true);
      expect(perms.visibility(doc(reviewDocId('t1')), collabPeer)).toBe(true);

      expect(perms.visibility(doc(metaDocId('t2')), collabPeer)).toBe(false);
      expect(perms.visibility(doc(convDocId('t2')), collabPeer)).toBe(false);
    });

    it('blocks collab peers from seeing room docs even with shared tasks', () => {
      const sharedTaskIds = new Set(['t1']);
      const perms = buildDualPermissions('collaborator-full', sharedTaskIds);
      expect(perms.visibility(doc(roomDocId('u1')), collabPeer)).toBe(false);
    });

    it('respects mutable Set additions at runtime', () => {
      const sharedTaskIds = new Set<string>();
      const perms = buildDualPermissions('collaborator-full', sharedTaskIds);

      expect(perms.visibility(doc(metaDocId('t1')), collabPeer)).toBe(false);

      sharedTaskIds.add('t1');
      expect(perms.visibility(doc(metaDocId('t1')), collabPeer)).toBe(true);
    });

    it('blocks collab peers for unparseable doc IDs', () => {
      const sharedTaskIds = new Set(['t1']);
      const perms = buildDualPermissions('collaborator-full', sharedTaskIds);
      expect(perms.visibility(doc('no-colons-here'), collabPeer)).toBe(false);
    });
  });

  describe('visibility without sharedTaskIds (backwards-compatible)', () => {
    it('blocks all docs for collab peers when sharedTaskIds is undefined', () => {
      const perms = buildDualPermissions('collaborator-full');
      expect(perms.visibility(doc(metaDocId('t1')), collabPeer)).toBe(false);
      expect(perms.visibility(doc(convDocId('t1')), collabPeer)).toBe(false);
    });

    it('still allows storage peers when sharedTaskIds is undefined', () => {
      const perms = buildDualPermissions('collaborator-full');
      expect(perms.visibility(doc(metaDocId('t1')), storagePeer)).toBe(true);
    });

    it('still allows personal adapter peers when sharedTaskIds is undefined', () => {
      const perms = buildDualPermissions('collaborator-full');
      expect(perms.visibility(doc(metaDocId('t1')), personalPeer)).toBe(true);
    });
  });
});

describe('buildCollaboratorPermissions', () => {
  const perms = buildCollaboratorPermissions();

  describe('mutability', () => {
    it('allows task-meta writes from network peers', () => {
      expect(perms.mutability(doc(metaDocId('t1')), networkPeer)).toBe(true);
    });

    it('allows task-conv writes from network peers', () => {
      expect(perms.mutability(doc(convDocId('t1')), networkPeer)).toBe(true);
    });

    it('allows task-review writes from network peers', () => {
      expect(perms.mutability(doc(reviewDocId('t1')), networkPeer)).toBe(true);
    });

    it('allows room doc writes from network peers', () => {
      expect(perms.mutability(doc(roomDocId('u1')), networkPeer)).toBe(true);
    });

    it('allows unparseable doc writes from network peers', () => {
      expect(perms.mutability(doc('no-colons-here'), networkPeer)).toBe(true);
    });

    it('allows storage writes', () => {
      expect(perms.mutability(doc(metaDocId('t1')), storagePeer)).toBe(true);
    });
  });

  describe('visibility', () => {
    it('always returns true', () => {
      expect(perms.visibility(doc(metaDocId('t1')), networkPeer)).toBe(true);
      expect(perms.visibility(doc(metaDocId('t1')), storagePeer)).toBe(true);
    });
  });

  describe('creation', () => {
    it('allows creation from storage', () => {
      expect(perms.creation('any-doc', storagePeer)).toBe(true);
    });

    it('allows creation from network peers', () => {
      expect(perms.creation('any-doc', networkPeer)).toBe(true);
    });
  });

  describe('deletion', () => {
    it('always blocks deletion', () => {
      expect(perms.deletion(doc(metaDocId('t1')), networkPeer)).toBe(false);
      expect(perms.deletion(doc(metaDocId('t1')), storagePeer)).toBe(false);
    });
  });
});
