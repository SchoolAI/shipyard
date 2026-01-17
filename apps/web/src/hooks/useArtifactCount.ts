import { getArtifacts } from '@peer-plan/schema';
import { useEffect, useState } from 'react';
import type * as Y from 'yjs';

/**
 * Hook to get artifact count from ydoc for use elsewhere.
 */
export function useArtifactCount(ydoc: Y.Doc): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const array = ydoc.getArray('artifacts');

    const updateCount = () => {
      setCount(getArtifacts(ydoc).length);
    };

    updateCount();
    array.observe(updateCount);
    return () => array.unobserve(updateCount);
  }, [ydoc]);

  return count;
}
