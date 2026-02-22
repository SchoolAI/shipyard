import type { Message } from '@shipyard/loro-schema';

export interface DispatchGateInput {
  conversation: readonly Message[];
  lastProcessedConvLen: number;
  isActive: boolean;
}

export type DispatchSkipReason =
  | 'active-task'
  | 'empty-conversation'
  | 'no-user-messages'
  | 'no-new-messages';

export type DispatchGateResult =
  | { dispatch: true; lastUserMessage: Message }
  | { dispatch: false; reason: DispatchSkipReason };

/**
 * Determines whether a task document change should trigger a new agent dispatch.
 *
 * The key insight: the question is "is there an unprocessed user message?"
 * not "is the very last message from a user?" A failed/canceled task may
 * have a trailing assistant message from the previous run, but a new user
 * message earlier in the unprocessed tail should still trigger dispatch.
 */
export function shouldDispatchNewWork(input: DispatchGateInput): DispatchGateResult {
  if (input.isActive) {
    return { dispatch: false, reason: 'active-task' };
  }

  const { conversation, lastProcessedConvLen } = input;

  if (conversation.length === 0) {
    return { dispatch: false, reason: 'empty-conversation' };
  }

  if (conversation.length <= lastProcessedConvLen) {
    return { dispatch: false, reason: 'no-new-messages' };
  }

  const unprocessedTail = conversation.slice(lastProcessedConvLen);
  const lastUserInTail = [...unprocessedTail].reverse().find((m) => m.role === 'user');

  if (!lastUserInTail) {
    return { dispatch: false, reason: 'no-user-messages' };
  }

  return { dispatch: true, lastUserMessage: lastUserInTail };
}
