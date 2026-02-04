import { RoomDocument } from '@shipyard/loro-schema';
import { useMemo } from 'react';
import { useRoomHandle } from './selectors/room-selectors';

export function useRoomDocument(): RoomDocument {
  const roomHandle = useRoomHandle();

  return useMemo(() => new RoomDocument(roomHandle.doc), [roomHandle.doc]);
}
