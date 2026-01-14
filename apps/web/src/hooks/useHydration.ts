import { ServerBlockNoteEditor } from '@blocknote/server-util';
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
      const editor = ServerBlockNoteEditor.create();

      ydoc.transact(() => {
        initPlanMetadata(ydoc, {
          id: urlPlan.id,
          title: urlPlan.title,
          status: urlPlan.status as
            | 'draft'
            | 'pending_review'
            | 'changes_requested'
            | 'in_progress'
            | 'completed',
          repo: urlPlan.repo,
          pr: urlPlan.pr,
        });

        // Initialize BlockNote content in document fragment (source of truth)
        const fragment = ydoc.getXmlFragment('document');
        editor.blocksToYXmlFragment(urlPlan.content, fragment);
      });

      hydrated.current = true;
    }
  }, [ydoc, urlPlan]);
}
