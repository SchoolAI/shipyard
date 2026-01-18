import { YDOC_KEYS } from '@peer-plan/schema';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { InputRequestManager } from './input-request-manager.js';

describe('InputRequestManager', () => {
  let ydoc: Y.Doc;
  let manager: InputRequestManager;

  beforeEach(() => {
    ydoc = new Y.Doc();
    manager = new InputRequestManager();
    // Clear any timers from previous tests
    vi.clearAllTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  describe('createRequest', () => {
    it('creates a text input request', () => {
      const requestId = manager.createRequest(ydoc, {
        message: 'What is your name?',
        type: 'text',
      });

      expect(requestId).toBeDefined();
      expect(typeof requestId).toBe('string');

      const request = manager.getRequest(ydoc, requestId);
      expect(request).toBeDefined();
      expect(request?.message).toBe('What is your name?');
      expect(request?.type).toBe('text');
      expect(request?.status).toBe('pending');
    });

    it('creates a choice input request with options', () => {
      const requestId = manager.createRequest(ydoc, {
        message: 'Select a color',
        type: 'choice',
        options: ['red', 'blue', 'green'],
      });

      const request = manager.getRequest(ydoc, requestId);
      // Narrow the type to ChoiceInputRequest to access options
      expect(request?.type).toBe('choice');
      if (request?.type === 'choice') {
        expect(request.options).toEqual(['red', 'blue', 'green']);
      }
    });

    it('creates a confirm input request', () => {
      const requestId = manager.createRequest(ydoc, {
        message: 'Are you sure?',
        type: 'confirm',
      });

      const request = manager.getRequest(ydoc, requestId);
      expect(request?.type).toBe('confirm');
    });

    it('creates a multiline input request', () => {
      const requestId = manager.createRequest(ydoc, {
        message: 'Enter a description',
        type: 'multiline',
        defaultValue: 'Default text',
      });

      const request = manager.getRequest(ydoc, requestId);
      expect(request?.type).toBe('multiline');
      expect(request?.defaultValue).toBe('Default text');
    });

    it('sets timeout when provided', () => {
      const requestId = manager.createRequest(ydoc, {
        message: 'Quick question?',
        type: 'text',
        timeout: 30,
      });

      const request = manager.getRequest(ydoc, requestId);
      expect(request?.timeout).toBe(30);
    });

    it('stores request in Y.Doc INPUT_REQUESTS array', () => {
      const requestId = manager.createRequest(ydoc, {
        message: 'Test',
        type: 'text',
      });

      const requestsArray = ydoc.getArray(YDOC_KEYS.INPUT_REQUESTS);
      expect(requestsArray.length).toBe(1);
      const storedRequest = requestsArray.get(0);
      expect(storedRequest).toBeDefined();
      expect((storedRequest as { id: string }).id).toBe(requestId);
    });
  });

  describe('getRequest', () => {
    it('returns undefined for non-existent request', () => {
      const request = manager.getRequest(ydoc, 'non-existent-id');
      expect(request).toBeUndefined();
    });

    it('returns request by ID', () => {
      const requestId = manager.createRequest(ydoc, {
        message: 'Test message',
        type: 'text',
      });

      const request = manager.getRequest(ydoc, requestId);
      expect(request).toBeDefined();
      expect(request?.id).toBe(requestId);
      expect(request?.message).toBe('Test message');
    });
  });

  describe('cancelRequest', () => {
    it('cancels a pending request', () => {
      const requestId = manager.createRequest(ydoc, {
        message: 'Test',
        type: 'text',
      });

      const cancelled = manager.cancelRequest(ydoc, requestId);
      expect(cancelled).toBe(true);

      const request = manager.getRequest(ydoc, requestId);
      expect(request?.status).toBe('cancelled');
    });

    it('returns false for non-existent request', () => {
      const cancelled = manager.cancelRequest(ydoc, 'non-existent');
      expect(cancelled).toBe(false);
    });

    it('returns false when trying to cancel already answered request', () => {
      const requestId = manager.createRequest(ydoc, {
        message: 'Test',
        type: 'text',
      });

      // Manually mark as answered
      ydoc.transact(() => {
        const requestsArray = ydoc.getArray(YDOC_KEYS.INPUT_REQUESTS);
        const request = requestsArray.get(0) as any;
        requestsArray.delete(0, 1);
        requestsArray.insert(0, [{ ...request, status: 'answered' }]);
      });

      const cancelled = manager.cancelRequest(ydoc, requestId);
      expect(cancelled).toBe(false);
    });
  });

  describe('waitForResponse', () => {
    it('resolves immediately if request already answered', async () => {
      const requestId = manager.createRequest(ydoc, {
        message: 'Test',
        type: 'text',
      });

      // Answer the request immediately
      ydoc.transact(() => {
        const requestsArray = ydoc.getArray(YDOC_KEYS.INPUT_REQUESTS);
        const request = requestsArray.get(0) as any;
        requestsArray.delete(0, 1);
        requestsArray.insert(0, [
          {
            ...request,
            status: 'answered',
            response: 'My answer',
            answeredAt: Date.now(),
            answeredBy: 'user123',
          },
        ]);
      });

      const response = await manager.waitForResponse(ydoc, requestId, 10);

      expect(response.success).toBe(true);
      expect(response.status).toBe('answered');
      // Narrow the discriminated union before accessing status-specific fields
      if (response.status === 'answered') {
        expect(response.response).toBe('My answer');
        expect(response.answeredBy).toBe('user123');
      }
    });

    it('resolves when request is answered after waiting', async () => {
      const requestId = manager.createRequest(ydoc, {
        message: 'Test',
        type: 'text',
      });

      // Simulate user answering after 100ms
      setTimeout(() => {
        ydoc.transact(() => {
          const requestsArray = ydoc.getArray(YDOC_KEYS.INPUT_REQUESTS);
          const request = requestsArray.get(0) as any;
          requestsArray.delete(0, 1);
          requestsArray.insert(0, [
            {
              ...request,
              status: 'answered',
              response: 'Delayed answer',
              answeredAt: Date.now(),
              answeredBy: 'user123',
            },
          ]);
        });
      }, 100);

      const response = await manager.waitForResponse(ydoc, requestId, 5);

      expect(response.success).toBe(true);
      // Narrow the discriminated union before accessing status-specific fields
      if (response.status === 'answered') {
        expect(response.response).toBe('Delayed answer');
      }
    });

    it('handles cancellation status', async () => {
      const requestId = manager.createRequest(ydoc, {
        message: 'Test',
        type: 'text',
      });

      // Cancel after 50ms
      setTimeout(() => {
        manager.cancelRequest(ydoc, requestId);
      }, 50);

      const response = await manager.waitForResponse(ydoc, requestId, 5);

      expect(response.success).toBe(false);
      expect(response.status).toBe('cancelled');
    });

    it('times out if no response within timeout period', async () => {
      vi.useFakeTimers();

      const requestId = manager.createRequest(ydoc, {
        message: 'Test',
        type: 'text',
      });

      const responsePromise = manager.waitForResponse(ydoc, requestId, 2);

      // Fast-forward time by 2 seconds
      await vi.advanceTimersByTimeAsync(2000);

      const response = await responsePromise;

      // Should be cancelled due to timeout
      expect(response.success).toBe(false);
      expect(response.status).toBe('cancelled');
      // Narrow the discriminated union before accessing failure-specific fields
      if (!response.success) {
        expect(response.reason).toBeDefined();
      }

      // Verify the request was marked as cancelled in Y.Doc
      const request = manager.getRequest(ydoc, requestId);
      expect(request?.status).toBe('cancelled');

      vi.useRealTimers();
    });

    it('returns cancelled if request not found', async () => {
      const response = await manager.waitForResponse(ydoc, 'non-existent', 5);

      expect(response.success).toBe(false);
      expect(response.status).toBe('cancelled');
      // Narrow the discriminated union before accessing failure-specific fields
      if (!response.success) {
        expect(response.reason).toContain('not found');
      }
    });

    it('uses request timeout if no timeout specified', async () => {
      vi.useFakeTimers();

      const requestId = manager.createRequest(ydoc, {
        message: 'Test',
        type: 'text',
        timeout: 10, // Request has 10 second timeout (minimum allowed)
      });

      const responsePromise = manager.waitForResponse(ydoc, requestId); // No timeout param

      // Fast-forward by 10 seconds
      await vi.advanceTimersByTimeAsync(10000);

      const response = await responsePromise;

      // Should be cancelled due to timeout
      expect(response.success).toBe(false);
      expect(response.status).toBe('cancelled');
      // Narrow the discriminated union before accessing failure-specific fields
      if (!response.success) {
        expect(response.reason).toBeDefined();
      }

      // Verify the request was marked as cancelled in Y.Doc
      const request = manager.getRequest(ydoc, requestId);
      expect(request?.status).toBe('cancelled');

      vi.useRealTimers();
    });
  });

  describe('getPendingRequests', () => {
    it('returns empty array when no requests exist', () => {
      const pending = manager.getPendingRequests(ydoc);
      expect(pending).toEqual([]);
    });

    it('returns only pending requests', () => {
      const id1 = manager.createRequest(ydoc, { message: 'Q1', type: 'text' });
      const id2 = manager.createRequest(ydoc, { message: 'Q2', type: 'text' });
      const id3 = manager.createRequest(ydoc, { message: 'Q3', type: 'text' });

      // Cancel one
      manager.cancelRequest(ydoc, id2);

      const pending = manager.getPendingRequests(ydoc);
      expect(pending.length).toBe(2);
      expect(pending.map((r) => r.id)).toEqual([id1, id3]);
    });

    it('excludes answered requests', () => {
      manager.createRequest(ydoc, { message: 'Q1', type: 'text' });

      // Answer it
      ydoc.transact(() => {
        const requestsArray = ydoc.getArray(YDOC_KEYS.INPUT_REQUESTS);
        const request = requestsArray.get(0) as any;
        requestsArray.delete(0, 1);
        requestsArray.insert(0, [
          {
            ...request,
            status: 'answered',
            response: 'Answer',
          },
        ]);
      });

      const pending = manager.getPendingRequests(ydoc);
      expect(pending.length).toBe(0);
    });
  });

  describe('cleanupOldRequests', () => {
    it('removes answered requests older than max age', () => {
      const oldTimestamp = Date.now() - 2 * 24 * 60 * 60 * 1000; // 2 days ago

      // Create request with old timestamp
      ydoc.transact(() => {
        const requestsArray = ydoc.getArray(YDOC_KEYS.INPUT_REQUESTS);
        requestsArray.push([
          {
            id: 'old-request',
            createdAt: oldTimestamp,
            message: 'Old question',
            type: 'text',
            status: 'answered',
            response: 'Old answer',
            answeredAt: oldTimestamp,
          },
        ]);
      });

      // Should remove requests older than 1 day
      const removed = manager.cleanupOldRequests(ydoc, 24 * 60 * 60 * 1000);

      expect(removed).toBe(1);

      const requestsArray = ydoc.getArray(YDOC_KEYS.INPUT_REQUESTS);
      expect(requestsArray.length).toBe(0);
    });

    it('keeps pending requests regardless of age', () => {
      const oldTimestamp = Date.now() - 2 * 24 * 60 * 60 * 1000; // 2 days ago

      ydoc.transact(() => {
        const requestsArray = ydoc.getArray(YDOC_KEYS.INPUT_REQUESTS);
        requestsArray.push([
          {
            id: 'old-pending',
            createdAt: oldTimestamp,
            message: 'Old question',
            type: 'text',
            status: 'pending',
          },
        ]);
      });

      const removed = manager.cleanupOldRequests(ydoc, 24 * 60 * 60 * 1000);

      expect(removed).toBe(0);

      const requestsArray = ydoc.getArray(YDOC_KEYS.INPUT_REQUESTS);
      expect(requestsArray.length).toBe(1);
    });

    it('keeps recent completed requests', () => {
      const recentTimestamp = Date.now() - 1000; // 1 second ago

      ydoc.transact(() => {
        const requestsArray = ydoc.getArray(YDOC_KEYS.INPUT_REQUESTS);
        requestsArray.push([
          {
            id: 'recent-request',
            createdAt: recentTimestamp,
            message: 'Recent question',
            type: 'text',
            status: 'answered',
            response: 'Recent answer',
            answeredAt: recentTimestamp,
          },
        ]);
      });

      const removed = manager.cleanupOldRequests(ydoc, 24 * 60 * 60 * 1000);

      expect(removed).toBe(0);

      const requestsArray = ydoc.getArray(YDOC_KEYS.INPUT_REQUESTS);
      expect(requestsArray.length).toBe(1);
    });
  });

  describe('integration: full request lifecycle', () => {
    it('creates request, waits, and receives answer', async () => {
      // Create request
      const requestId = manager.createRequest(ydoc, {
        message: 'What is your favorite color?',
        type: 'text',
      });

      // Start waiting for response
      const responsePromise = manager.waitForResponse(ydoc, requestId, 10);

      // Simulate user answering immediately (sync)
      ydoc.transact(() => {
        const requestsArray = ydoc.getArray(YDOC_KEYS.INPUT_REQUESTS);
        const request = requestsArray.get(0) as any;
        requestsArray.delete(0, 1);
        requestsArray.insert(0, [
          {
            ...request,
            status: 'answered',
            response: 'blue',
            answeredAt: Date.now(),
            answeredBy: 'user123',
          },
        ]);
      });

      // Wait for response
      const response = await responsePromise;

      expect(response.success).toBe(true);
      // Narrow the discriminated union before accessing status-specific fields
      if (response.status === 'answered') {
        expect(response.response).toBe('blue');
        expect(response.answeredBy).toBe('user123');
      }
    });
  });
});
