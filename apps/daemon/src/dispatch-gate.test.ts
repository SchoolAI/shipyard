import type { Message } from '@shipyard/loro-schema';
import { describe, expect, it } from 'vitest';
import { shouldDispatchNewWork } from './dispatch-gate.js';

function makeMessage(role: 'user' | 'assistant', overrides: Partial<Message> = {}): Message {
  return {
    messageId: `msg-${Math.random().toString(36).slice(2, 8)}`,
    role,
    content: [{ type: 'text', text: `${role} message` }],
    timestamp: Date.now(),
    model: null,
    machineId: null,
    reasoningEffort: null,
    permissionMode: null,
    cwd: '/tmp',
    authorId: null,
    authorName: null,
    ...overrides,
  };
}

describe('shouldDispatchNewWork', () => {
  describe('blocks dispatch for active tasks', () => {
    it('returns active-task when task is already running', () => {
      const result = shouldDispatchNewWork({
        conversation: [makeMessage('user')],
        lastProcessedConvLen: 0,
        isActive: true,
      });

      expect(result).toEqual({ dispatch: false, reason: 'active-task' });
    });
  });

  describe('blocks dispatch for empty conversations', () => {
    it('returns empty-conversation when no messages exist', () => {
      const result = shouldDispatchNewWork({
        conversation: [],
        lastProcessedConvLen: 0,
        isActive: false,
      });

      expect(result).toEqual({ dispatch: false, reason: 'empty-conversation' });
    });
  });

  describe('blocks dispatch when no new messages', () => {
    it('returns no-new-messages when conversation length matches last processed', () => {
      const result = shouldDispatchNewWork({
        conversation: [makeMessage('user')],
        lastProcessedConvLen: 1,
        isActive: false,
      });

      expect(result).toEqual({ dispatch: false, reason: 'no-new-messages' });
    });

    it('returns no-new-messages when conversation is shorter than last processed', () => {
      const result = shouldDispatchNewWork({
        conversation: [makeMessage('user')],
        lastProcessedConvLen: 5,
        isActive: false,
      });

      expect(result).toEqual({ dispatch: false, reason: 'no-new-messages' });
    });
  });

  describe('dispatches for new user messages (happy path)', () => {
    it('dispatches when last message is from user', () => {
      const userMsg = makeMessage('user');
      const result = shouldDispatchNewWork({
        conversation: [userMsg],
        lastProcessedConvLen: 0,
        isActive: false,
      });

      expect(result).toEqual({ dispatch: true, lastUserMessage: userMsg });
    });

    it('dispatches when user message follows assistant message', () => {
      const userMsg = makeMessage('user');
      const result = shouldDispatchNewWork({
        conversation: [makeMessage('assistant'), userMsg],
        lastProcessedConvLen: 0,
        isActive: false,
      });

      expect(result).toEqual({ dispatch: true, lastUserMessage: userMsg });
    });
  });

  describe('Bug #2: dispatches when user message is NOT the absolute last', () => {
    it('dispatches when assistant message follows user in unprocessed tail', () => {
      const userMsg = makeMessage('user');
      const result = shouldDispatchNewWork({
        conversation: [userMsg, makeMessage('assistant')],
        lastProcessedConvLen: 0,
        isActive: false,
      });

      expect(result).toEqual({ dispatch: true, lastUserMessage: userMsg });
    });

    it('dispatches for failed task with [user, assistant(old), user(new), assistant(stale)]', () => {
      const newUserMsg = makeMessage('user', { messageId: 'new-user-msg' });
      const conversation = [
        makeMessage('user', { messageId: 'old-user' }),
        makeMessage('assistant', { messageId: 'old-assistant' }),
        newUserMsg,
        makeMessage('assistant', { messageId: 'stale-assistant' }),
      ];

      const result = shouldDispatchNewWork({
        conversation,
        lastProcessedConvLen: 2,
        isActive: false,
      });

      expect(result).toEqual({ dispatch: true, lastUserMessage: newUserMsg });
    });

    it('dispatches for promoted follow-up with trailing stale assistant', () => {
      const followUpMsg = makeMessage('user', { messageId: 'follow-up' });
      const conversation = [
        makeMessage('user'),
        makeMessage('assistant'),
        followUpMsg,
        makeMessage('assistant', { messageId: 'stale-from-crdt-merge' }),
      ];

      const result = shouldDispatchNewWork({
        conversation,
        lastProcessedConvLen: 2,
        isActive: false,
      });

      expect(result).toEqual({ dispatch: true, lastUserMessage: followUpMsg });
    });
  });

  describe('blocks dispatch when only assistant messages are new', () => {
    it('returns no-user-messages when only new messages are from assistant', () => {
      const result = shouldDispatchNewWork({
        conversation: [makeMessage('user'), makeMessage('assistant'), makeMessage('assistant')],
        lastProcessedConvLen: 1,
        isActive: false,
      });

      expect(result).toEqual({ dispatch: false, reason: 'no-user-messages' });
    });
  });

  describe('uses unprocessed tail for decision', () => {
    it('only considers messages after lastProcessedConvLen', () => {
      const oldUser = makeMessage('user', { messageId: 'old' });
      const result = shouldDispatchNewWork({
        conversation: [oldUser, makeMessage('assistant'), makeMessage('assistant')],
        lastProcessedConvLen: 2,
        isActive: false,
      });

      expect(result).toEqual({ dispatch: false, reason: 'no-user-messages' });
    });

    it('finds user message in unprocessed tail even when processed section has none', () => {
      const newUser = makeMessage('user', { messageId: 'new' });
      const result = shouldDispatchNewWork({
        conversation: [makeMessage('assistant'), makeMessage('assistant'), newUser],
        lastProcessedConvLen: 2,
        isActive: false,
      });

      expect(result).toEqual({ dispatch: true, lastUserMessage: newUser });
    });
  });

  describe('lastProcessedConvLen defaults', () => {
    it('treats 0 as no prior processing (all messages are new)', () => {
      const userMsg = makeMessage('user');
      const result = shouldDispatchNewWork({
        conversation: [userMsg, makeMessage('assistant')],
        lastProcessedConvLen: 0,
        isActive: false,
      });

      expect(result).toEqual({ dispatch: true, lastUserMessage: userMsg });
    });
  });
});
