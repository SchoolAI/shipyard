import { getLinkedPRs, type LinkedPR, YDOC_KEYS } from '@peer-plan/schema';
import { useEffect, useState } from 'react';
import type * as Y from 'yjs';

/**
 * Hook to observe linked PRs from Y.Doc.
 * Returns the current list of linked PRs and updates when the CRDT changes.
 */
export function useLinkedPRs(ydoc: Y.Doc): LinkedPR[] {
  const [linkedPRs, setLinkedPRs] = useState<LinkedPR[]>([]);

  useEffect(() => {
    const array = ydoc.getArray(YDOC_KEYS.LINKED_PRS);

    const update = () => {
      setLinkedPRs(getLinkedPRs(ydoc));
    };

    update();
    array.observe(update);
    return () => array.unobserve(update);
  }, [ydoc]);

  return linkedPRs;
}
