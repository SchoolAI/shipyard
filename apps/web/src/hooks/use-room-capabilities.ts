import {
  buildDocumentId,
  DEFAULT_EPOCH,
  type MachineCapabilitiesEphemeralValue,
  ROOM_EPHEMERAL_DECLARATIONS,
  TaskIndexDocumentSchema,
} from '@shipyard/loro-schema';
import { useEffect, useMemo, useState } from 'react';
import { useRepo } from '../providers/repo-provider';

/**
 * useEffect below guards on userId, so the handle is never read when null.
 * We still need to call repo.get() unconditionally because the handle feeds
 * into the useEffect dependency array (rules of hooks). This sentinel doc
 * is inert -- its ephemeral store is never subscribed to.
 */
const SENTINEL_DOC_ID = buildDocumentId('room', '__sentinel__', DEFAULT_EPOCH);

const EMPTY_CAPABILITIES = new Map<string, MachineCapabilitiesEphemeralValue>();

/**
 * Read machine capabilities from the room document's ephemeral namespace.
 *
 * Capabilities are keyed by machineId. The daemon sets them via ephemeral
 * when it connects through WebRTC. They auto-clean when the peer disconnects.
 */
export function useRoomCapabilities(
  userId: string | null
): Map<string, MachineCapabilitiesEphemeralValue> {
  const repo = useRepo();

  const docId = useMemo(
    () => (userId ? buildDocumentId('room', userId, DEFAULT_EPOCH) : SENTINEL_DOC_ID),
    [userId]
  );

  // eslint-disable-next-line no-restricted-syntax -- loro-extended generics require explicit cast
  const handle = useMemo(
    () => repo.get(docId, TaskIndexDocumentSchema as never, ROOM_EPHEMERAL_DECLARATIONS),
    [repo, docId]
  );

  const [capabilities, setCapabilities] =
    useState<Map<string, MachineCapabilitiesEphemeralValue>>(EMPTY_CAPABILITIES);

  useEffect(() => {
    if (!userId) {
      setCapabilities(EMPTY_CAPABILITIES);
      return;
    }

    const capsEphemeral = handle.capabilities;

    const initialState = capsEphemeral.getAll();
    setCapabilities(initialState.size > 0 ? new Map(initialState) : EMPTY_CAPABILITIES);

    const unsub = capsEphemeral.subscribe(({ key, value }) => {
      setCapabilities((prev) => {
        const next = new Map(prev);
        if (value) {
          next.set(key, value);
        } else {
          next.delete(key);
        }
        return next;
      });
    });

    return unsub;
  }, [handle, userId]);

  return capabilities;
}
