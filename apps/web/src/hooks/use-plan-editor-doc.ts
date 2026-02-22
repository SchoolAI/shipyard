export { usePlanEditorDoc };
export type { PlanEditorDocResult };

import { useDoc } from '@loro-extended/react';
import {
  buildTaskReviewDocId,
  DEFAULT_EPOCH,
  TaskReviewDocumentSchema,
} from '@shipyard/loro-schema';
import type { ContainerID, LoroDoc } from 'loro-crdt';
import { isContainer } from 'loro-crdt';
import { useMemo } from 'react';
import { useRepo } from '../providers/repo-provider';

const SENTINEL_DOC_ID = buildTaskReviewDocId('__sentinel__', DEFAULT_EPOCH);

interface PlanEditorDocResult {
  loroDoc: LoroDoc | null;
  containerId: ContainerID | null;
  isReady: boolean;
}

function usePlanEditorDoc(taskId: string | null, planId: string | null): PlanEditorDocResult {
  const repo = useRepo();

  const docId = useMemo(
    () => (taskId ? buildTaskReviewDocId(taskId, DEFAULT_EPOCH) : SENTINEL_DOC_ID),
    [taskId]
  );

  // eslint-disable-next-line no-restricted-syntax -- loro-extended generics require explicit cast
  const handle = useMemo(() => repo.get(docId, TaskReviewDocumentSchema as never), [repo, docId]);

  const planEditorDocs = useDoc(
    handle,
    (d: { planEditorDocs: Record<string, unknown> }) => d.planEditorDocs
  );

  return useMemo((): PlanEditorDocResult => {
    if (!taskId || !planId) {
      return { loroDoc: null, containerId: null, isReady: false };
    }

    if (!planEditorDocs || !(planId in planEditorDocs)) {
      return { loroDoc: null, containerId: null, isReady: false };
    }

    const loroDoc = handle.loroDoc;
    const planEditorDocsMap = loroDoc.getMap('planEditorDocs');
    const value = planEditorDocsMap.get(planId);

    if (value && isContainer(value)) {
      return { loroDoc, containerId: value.id, isReady: true };
    }

    return { loroDoc: null, containerId: null, isReady: false };
  }, [taskId, planId, planEditorDocs, handle]);
}
