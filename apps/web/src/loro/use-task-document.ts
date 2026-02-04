import { TaskDocument, type TaskId } from '@shipyard/loro-schema';
import { useEffect, useMemo } from 'react';
import { useRoomHandle } from './selectors/room-selectors';
import { useTaskHandle } from './selectors/task-selectors';

export function useTaskDocument(taskId: TaskId): TaskDocument {
  const taskHandle = useTaskHandle(taskId);
  const roomHandle = useRoomHandle();

  const taskDoc = useMemo(
    () => new TaskDocument(taskHandle.doc, roomHandle.doc, taskId),
    [taskHandle.doc, roomHandle.doc, taskId]
  );

  useEffect(() => {
    return () => taskDoc.dispose();
  }, [taskDoc]);

  return taskDoc;
}
