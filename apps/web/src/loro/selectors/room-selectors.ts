import { useDoc, useHandle } from '@loro-extended/react';
import {
  RoomEphemeralDeclarations,
  RoomSchema,
  type TaskId,
  toTaskId,
} from '@shipyard/loro-schema';

const ROOM_DOC_ID = 'room';

export function useRoomHandle() {
  return useHandle(ROOM_DOC_ID, RoomSchema, RoomEphemeralDeclarations);
}

export function useTaskIndex() {
  const handle = useRoomHandle();
  return useDoc(handle, (d) => d.taskIndex);
}

export function useTaskIndexEntry(taskId: TaskId) {
  const handle = useRoomHandle();
  return useDoc(handle, (d) => d.taskIndex[taskId]);
}

export function useInboxEvents() {
  const handle = useRoomHandle();
  return useDoc(handle, (d) => {
    const allEvents = Object.values(d.taskIndex).flatMap((entry) =>
      entry.inboxEvents.map((event) => ({
        taskId: entry.taskId,
        event,
      }))
    );
    return allEvents.sort((a, b) => b.event.timestamp - a.event.timestamp);
  });
}

export function useTasksWithPendingRequests() {
  const handle = useRoomHandle();
  return useDoc(handle, (d) => {
    return Object.values(d.taskIndex).filter((entry) => entry.hasPendingRequests);
  });
}

export function useTaskIds() {
  const handle = useRoomHandle();
  return useDoc(handle, (d) => Object.keys(d.taskIndex).map(toTaskId));
}
