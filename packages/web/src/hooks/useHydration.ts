import { initPlanMetadata, type UrlEncodedPlan } from '@peer-plan/schema';
import { useEffect, useRef } from 'react';
import type * as Y from 'yjs';

/**
 * Hydrates a Y.Doc from a URL-encoded plan snapshot if the Y.Doc is empty.
 * This ensures that when a user opens a plan URL for the first time,
 * the content from the URL is loaded into the CRDT.
 */
export function useHydration(ydoc: Y.Doc, urlPlan: UrlEncodedPlan): void {
  const hydrated = useRef(false);

  useEffect(() => {
    if (hydrated.current) return;

    const metadata = ydoc.getMap('metadata');

    // Only hydrate if Y.Doc is empty (no prior state from IndexedDB or server)
    if (metadata.size === 0) {
      ydoc.transact(() => {
        // Initialize metadata from URL snapshot
        initPlanMetadata(ydoc, {
          id: urlPlan.id,
          title: urlPlan.title,
          status: urlPlan.status as 'draft' | 'pending_review' | 'approved' | 'changes_requested',
          repo: urlPlan.repo,
          pr: urlPlan.pr,
        });

        // Initialize BlockNote content array
        const content = ydoc.getArray('content');
        for (const block of urlPlan.content) {
          content.push([block]);
        }
      });

      hydrated.current = true;
    }
  }, [ydoc, urlPlan]);
}
