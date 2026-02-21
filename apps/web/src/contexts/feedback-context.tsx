export { FeedbackProvider, useFeedback };
export type { FeedbackContextValue };

import type { PermissionMode } from '@shipyard/loro-schema';
import { createContext, type ReactNode, useContext, useMemo } from 'react';
import type { SubmitPayload } from '../components/chat-composer';
import type { ReasoningLevel } from '../components/composer/reasoning-effort';

interface FeedbackContextValue {
  onSubmit: (payload: SubmitPayload) => void;
  onInterruptAndSend: (payload: SubmitPayload) => void;
  isAgentRunning: boolean;
  composerModel: string;
  composerReasoning: ReasoningLevel;
  composerPermission: PermissionMode;
  markCommentsDelivered: (commentIds: string[]) => void;
}

const FeedbackContext = createContext<FeedbackContextValue | null>(null);

function FeedbackProvider({
  onSubmit,
  onInterruptAndSend,
  isAgentRunning,
  composerModel,
  composerReasoning,
  composerPermission,
  markCommentsDelivered,
  children,
}: FeedbackContextValue & { children: ReactNode }) {
  const value = useMemo(
    () => ({
      onSubmit,
      onInterruptAndSend,
      isAgentRunning,
      composerModel,
      composerReasoning,
      composerPermission,
      markCommentsDelivered,
    }),
    [
      onSubmit,
      onInterruptAndSend,
      isAgentRunning,
      composerModel,
      composerReasoning,
      composerPermission,
      markCommentsDelivered,
    ]
  );
  return <FeedbackContext value={value}>{children}</FeedbackContext>;
}

function useFeedback(): FeedbackContextValue {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error('useFeedback must be used within a <FeedbackProvider>');
  return ctx;
}
