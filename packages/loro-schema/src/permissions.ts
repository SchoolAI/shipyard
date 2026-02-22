import { type DocumentPrefix, parseDocumentId } from './epoch.js';

function assertNever(x: never): never {
  throw new Error(`Unhandled document prefix: ${String(x)}`);
}

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
 * The canonical `PeerContext` also includes `peerName`, `peerType`, and `channelId`,
 * but our permission predicates only inspect `peerId` and `channelKind`.
 *
 * `peerId` is `PeerID` from `loro-crdt` (a template literal `${number}` string).
 * We use `string` here to avoid importing from `loro-crdt` — structurally compatible
 * since template literal `${number}` extends `string`.
 */
type PeerContext = { peerId: string; channelKind: 'storage' | 'network' | 'other' };

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
 * Exhaustive check for document prefix mutability by collaborator role.
 * Adding a new DocumentPrefix without handling it here is a compile error.
 */
function prefixMutability(prefix: DocumentPrefix, role: PeerRole): boolean {
  switch (prefix) {
    case 'task-meta':
      return false;
    case 'task-conv':
      return role === 'collaborator-full';
    case 'task-review':
      return role !== 'viewer';
    case 'room':
      return false;
    case 'epoch':
      return false;
    default:
      return assertNever(prefix);
  }
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

      return prefixMutability(parsed.prefix, localRole);
    },

    creation: (_docId: string, _peer: PeerContext): boolean => true,

    deletion: (_doc: DocContext, _peer: PeerContext) => false,
  };
}

/**
 * Build permissive permission predicates for a collaborator-only Repo.
 *
 * Used when the browser has NO personal room connection (no daemon). All
 * incoming data arrives from the owner via the collab adapter. The
 * collaborator accepts everything because the OWNER's Repo is the authority
 * that enforces restrictions on unauthorized collaborator writes.
 */
export function buildCollaboratorPermissions(): ShipyardPermissions {
  return {
    visibility: (_doc: DocContext, _peer: PeerContext) => true,
    mutability: (_doc: DocContext, _peer: PeerContext) => true,
    creation: (_docId: string, _peer: PeerContext): boolean => true,
    deletion: (_doc: DocContext, _peer: PeerContext) => false,
  };
}

/**
 * Build dual-adapter permission predicates for a Loro Repo.
 *
 * The trust anchor is `channelKind`:
 * - `'storage'` (IndexedDB) and `'network'` (personal WebRTC adapter) are fully trusted.
 * - `'other'` (collab WebRTC adapter) is restricted by role and sharedTaskIds.
 *
 * This requires the collab adapter to report `kind: 'other'` instead of the
 * default `'network'`. See `CollabWebRtcAdapter` in repo-provider.tsx.
 */
export function buildDualPermissions(
  collabRole: PeerRole = 'collaborator-full',
  sharedTaskIds?: Set<string>
): ShipyardPermissions {
  return {
    visibility: (doc: DocContext, peer: PeerContext): boolean => {
      if (peer.channelKind === 'storage' || peer.channelKind === 'network') return true;

      if (!sharedTaskIds || sharedTaskIds.size === 0) return false;

      const parsed = parseDocumentId(doc.id);
      if (!parsed) return false;

      return sharedTaskIds.has(parsed.key);
    },

    mutability: (doc: DocContext, peer: PeerContext): boolean => {
      if (peer.channelKind === 'storage' || peer.channelKind === 'network') return true;

      const parsed = parseDocumentId(doc.id);
      if (!parsed) return false;

      if (sharedTaskIds && !sharedTaskIds.has(parsed.key)) return false;

      return prefixMutability(parsed.prefix, collabRole);
    },

    creation: (_docId: string, _peer: PeerContext): boolean => true,

    deletion: (_doc: DocContext, _peer: PeerContext) => false,
  };
}
