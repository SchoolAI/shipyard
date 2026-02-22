import { parseDocumentId } from './epoch.js';

export type PeerRole = 'owner' | 'collaborator-full' | 'collaborator-review' | 'viewer';

/**
 * Structural subset of `DocContext` from `@loro-extended/repo`.
 *
 * We use a structural type here instead of importing from `@loro-extended/repo`
 * because `@shipyard/loro-schema` is a schema-only package and should not
 * depend on the repo runtime. This type is structurally compatible with the
 * canonical `DocContext` (which also has `doc: LoroDoc`), so our permission
 * functions can be passed directly to `Repo({ permissions })`.
 */
type DocContext = { id: string };

/**
 * Structural subset of `PeerContext` from `@loro-extended/repo`.
 *
 * Same rationale as `DocContext` — avoids a runtime dependency on `@loro-extended/repo`.
 * The canonical `PeerContext` also includes `peerId`, `peerName`, `peerType`,
 * and `channelId`, but our permission predicates only inspect `channelKind`.
 */
type PeerContext = { channelKind: 'storage' | 'network' | 'other' };

/**
 * Structural subset of `Permissions` from `@loro-extended/repo`.
 *
 * Matches the four permission predicates expected by `Repo({ permissions })`.
 * The canonical interface uses `DocId` (which is `string`) for `creation`.
 */
interface ShipyardPermissions {
  visibility: (_doc: DocContext, _peer: PeerContext) => boolean;
  mutability: (doc: DocContext, peer: PeerContext) => boolean;
  creation: (_docId: string, _peer: PeerContext) => boolean;
  deletion: (_doc: DocContext, _peer: PeerContext) => boolean;
}

/**
 * Build Shipyard-specific permission predicates for a Loro Repo.
 *
 * The `localRole` parameter determines document-level mutability for
 * incoming CRDT operations from network peers. Set at Repo creation
 * time based on the connection context (personal room = owner,
 * collab room = collaborator role from session server).
 */
export function buildShipyardPermissions(localRole: PeerRole): ShipyardPermissions {
  return {
    visibility: (_doc: DocContext, _peer: PeerContext) => true,

    mutability: (doc: DocContext, peer: PeerContext): boolean => {
      if (peer.channelKind === 'storage') return true;
      if (localRole === 'owner') return true;

      const parsed = parseDocumentId(doc.id);
      if (!parsed) return false;

      switch (parsed.prefix) {
        case 'task-meta':
          return false;
        case 'task-conv':
          return localRole === 'collaborator-full';
        case 'task-review':
          return localRole !== 'viewer';
        default:
          return false;
      }
    },

    creation: (_docId: string, _peer: PeerContext): boolean => true,

    deletion: (_doc: DocContext, _peer: PeerContext) => false,
  };
}
