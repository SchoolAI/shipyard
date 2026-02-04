import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import type { WebrtcProvider } from 'y-webrtc';
import type * as Y from 'yjs';
import {
  type ReceivedConversation,
  useConversationTransfer,
} from '@/hooks/useConversationTransfer';

export function useImportConversationToast(
  planId: string,
  ydoc: Y.Doc,
  rtcProvider: WebrtcProvider | null,
  onReviewRequest?: (received: ReceivedConversation) => void
) {
  const { receivedConversations, clearReceived } = useConversationTransfer(
    planId,
    ydoc,
    rtcProvider
  );

  const shownToastsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    for (const received of receivedConversations) {
      const toastKey = `${received.meta.exportId}-${received.receivedAt}`;

      if (shownToastsRef.current.has(toastKey)) {
        continue;
      }

      shownToastsRef.current.add(toastKey);

      toast.info(
        `Received conversation from ${received.meta.sourcePlatform} (${received.meta.messageCount} messages)`,
        {
          duration: 10000,
          action: {
            label: 'Review',
            onClick: () => {
              onReviewRequest?.(received);
            },
          },
        }
      );
    }
  }, [receivedConversations, onReviewRequest]);

  return { receivedConversations, clearReceived };
}

export type { ReceivedConversation } from '@/hooks/useConversationTransfer';
