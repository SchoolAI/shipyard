import { YDOC_KEYS } from '@shipyard/schema';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { InputRequestManager } from './input-request-manager.js';

describe('InputRequestManager', () => {
  let ydoc: Y.Doc;
  let manager: InputRequestManager;

  beforeEach(() => {
    ydoc = new Y.Doc();
    manager = new InputRequestManager();
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
        timeout: 600,
      });

      const request = manager.getRequest(ydoc, requestId);
      expect(request?.timeout).toBe(600);
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
      if (response.status === 'answered') {
        expect(response.response).toBe('Delayed answer');
      }
    });

    it('handles cancellation status', async () => {
      const requestId = manager.createRequest(ydoc, {
        message: 'Test',
        type: 'text',
      });

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

      await vi.advanceTimersByTimeAsync(2000);

      const response = await responsePromise;

      expect(response.success).toBe(false);
      expect(response.status).toBe('cancelled');
      if (!response.success) {
        expect(response.reason).toBeDefined();
      }

      const request = manager.getRequest(ydoc, requestId);
      expect(request?.status).toBe('cancelled');

      vi.useRealTimers();
    });

    it('returns cancelled if request not found', async () => {
      const response = await manager.waitForResponse(ydoc, 'non-existent', 5);

      expect(response.success).toBe(false);
      expect(response.status).toBe('cancelled');
      if (!response.success) {
        expect(response.reason).toContain('not found');
      }
    });

    it('uses request timeout if no timeout specified', async () => {
      vi.useFakeTimers();

      const requestId = manager.createRequest(ydoc, {
        message: 'Test',
        type: 'text',
        timeout: 300,
      });

      const responsePromise = manager.waitForResponse(ydoc, requestId);

      await vi.advanceTimersByTimeAsync(300000);

      const response = await responsePromise;

      expect(response.success).toBe(false);
      expect(response.status).toBe('cancelled');
      if (!response.success) {
        expect(response.reason).toBeDefined();
      }

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

      manager.cancelRequest(ydoc, id2);

      const pending = manager.getPendingRequests(ydoc);
      expect(pending.length).toBe(2);
      expect(pending.map((r) => r.id)).toEqual([id1, id3]);
    });

    it('excludes answered requests', () => {
      manager.createRequest(ydoc, { message: 'Q1', type: 'text' });

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
      const oldTimestamp = Date.now() - 2 * 24 * 60 * 60 * 1000;

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

      const removed = manager.cleanupOldRequests(ydoc, 24 * 60 * 60 * 1000);

      expect(removed).toBe(1);

      const requestsArray = ydoc.getArray(YDOC_KEYS.INPUT_REQUESTS);
      expect(requestsArray.length).toBe(0);
    });

    it('keeps pending requests regardless of age', () => {
      const oldTimestamp = Date.now() - 2 * 24 * 60 * 60 * 1000;

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
      const recentTimestamp = Date.now() - 1000;

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
      const requestId = manager.createRequest(ydoc, {
        message: 'What is your favorite color?',
        type: 'text',
      });

      const responsePromise = manager.waitForResponse(ydoc, requestId, 10);

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

      const response = await responsePromise;

      expect(response.success).toBe(true);
      if (response.status === 'answered') {
        expect(response.response).toBe('blue');
        expect(response.answeredBy).toBe('user123');
      }
    });
  });

  describe('integration: number input lifecycle', () => {
    it('creates number request, waits, receives answer', async () => {
      const requestId = manager.createRequest(ydoc, {
        message: 'How many retries?',
        type: 'number',
        min: 0,
        max: 10,
      });

      expect(requestId).toBeDefined();
      const request = manager.getRequest(ydoc, requestId);
      expect(request?.type).toBe('number');
      if (request?.type === 'number') {
        expect(request.min).toBe(0);
        expect(request.max).toBe(10);
      }

      const responsePromise = manager.waitForResponse(ydoc, requestId, 10);

      setTimeout(() => {
        ydoc.transact(() => {
          const requestsArray = ydoc.getArray(YDOC_KEYS.INPUT_REQUESTS);
          const req = requestsArray.get(0) as any;
          requestsArray.delete(0, 1);
          requestsArray.insert(0, [
            {
              ...req,
              status: 'answered',
              response: '5',
              answeredAt: Date.now(),
              answeredBy: 'test-user',
            },
          ]);
        });
      }, 10);

      const result = await responsePromise;
      expect(result.success).toBe(true);
      expect(result.status).toBe('answered');
      if (result.status === 'answered') {
        expect(result.response).toBe('5');
      }
    });
  });

  describe('integration: email input lifecycle', () => {
    it('creates email request, waits, receives answer', async () => {
      const requestId = manager.createRequest(ydoc, {
        message: 'Enter your email',
        type: 'email',
        domain: 'company.com',
      });

      expect(requestId).toBeDefined();
      const request = manager.getRequest(ydoc, requestId);
      expect(request?.type).toBe('email');
      if (request?.type === 'email') {
        expect(request.domain).toBe('company.com');
      }

      const responsePromise = manager.waitForResponse(ydoc, requestId, 10);

      setTimeout(() => {
        ydoc.transact(() => {
          const requestsArray = ydoc.getArray(YDOC_KEYS.INPUT_REQUESTS);
          const req = requestsArray.get(0) as any;
          requestsArray.delete(0, 1);
          requestsArray.insert(0, [
            {
              ...req,
              status: 'answered',
              response: 'user@company.com',
              answeredAt: Date.now(),
              answeredBy: 'test-user',
            },
          ]);
        });
      }, 10);

      const result = await responsePromise;
      expect(result.success).toBe(true);
      expect(result.status).toBe('answered');
      if (result.status === 'answered') {
        expect(result.response).toBe('user@company.com');
      }
    });
  });

  describe('integration: date input lifecycle', () => {
    it('creates date request, waits, receives answer', async () => {
      const requestId = manager.createRequest(ydoc, {
        message: 'Select a deadline',
        type: 'date',
        min: '2026-01-01',
        max: '2026-12-31',
      });

      expect(requestId).toBeDefined();
      const request = manager.getRequest(ydoc, requestId);
      expect(request?.type).toBe('date');
      if (request?.type === 'date') {
        expect(request.min).toBe('2026-01-01');
        expect(request.max).toBe('2026-12-31');
      }

      const responsePromise = manager.waitForResponse(ydoc, requestId, 10);

      setTimeout(() => {
        ydoc.transact(() => {
          const requestsArray = ydoc.getArray(YDOC_KEYS.INPUT_REQUESTS);
          const req = requestsArray.get(0) as any;
          requestsArray.delete(0, 1);
          requestsArray.insert(0, [
            {
              ...req,
              status: 'answered',
              response: '2026-06-15',
              answeredAt: Date.now(),
              answeredBy: 'test-user',
            },
          ]);
        });
      }, 10);

      const result = await responsePromise;
      expect(result.success).toBe(true);
      expect(result.status).toBe('answered');
      if (result.status === 'answered') {
        expect(result.response).toBe('2026-06-15');
      }
    });
  });

  describe('integration: choice with displayAs=dropdown lifecycle', () => {
    it('creates choice request with dropdown display, waits, receives answer', async () => {
      const requestId = manager.createRequest(ydoc, {
        message: 'Select a country',
        type: 'choice',
        options: ['United States', 'Canada', 'Mexico'],
        displayAs: 'dropdown',
        placeholder: 'Choose a country...',
      });

      expect(requestId).toBeDefined();
      const request = manager.getRequest(ydoc, requestId);
      expect(request?.type).toBe('choice');
      if (request?.type === 'choice') {
        expect(request.options).toEqual(['United States', 'Canada', 'Mexico']);
        expect(request.displayAs).toBe('dropdown');
        expect(request.placeholder).toBe('Choose a country...');
      }

      const responsePromise = manager.waitForResponse(ydoc, requestId, 10);

      setTimeout(() => {
        ydoc.transact(() => {
          const requestsArray = ydoc.getArray(YDOC_KEYS.INPUT_REQUESTS);
          const req = requestsArray.get(0) as any;
          requestsArray.delete(0, 1);
          requestsArray.insert(0, [
            {
              ...req,
              status: 'answered',
              response: 'Canada',
              answeredAt: Date.now(),
              answeredBy: 'test-user',
            },
          ]);
        });
      }, 10);

      const result = await responsePromise;
      expect(result.success).toBe(true);
      expect(result.status).toBe('answered');
      if (result.status === 'answered') {
        expect(result.response).toBe('Canada');
      }
    });
  });

  describe('integration: rating input lifecycle', () => {
    it('creates rating request, waits, receives answer', async () => {
      const requestId = manager.createRequest(ydoc, {
        message: 'Rate this feature',
        type: 'rating',
        min: 1,
        max: 5,
        style: 'stars',
        labels: { low: 'Poor', high: 'Excellent' },
      });

      expect(requestId).toBeDefined();
      const request = manager.getRequest(ydoc, requestId);
      expect(request?.type).toBe('rating');
      if (request?.type === 'rating') {
        expect(request.min).toBe(1);
        expect(request.max).toBe(5);
        expect(request.style).toBe('stars');
        expect(request.labels).toEqual({ low: 'Poor', high: 'Excellent' });
      }

      const responsePromise = manager.waitForResponse(ydoc, requestId, 10);

      setTimeout(() => {
        ydoc.transact(() => {
          const requestsArray = ydoc.getArray(YDOC_KEYS.INPUT_REQUESTS);
          const req = requestsArray.get(0) as any;
          requestsArray.delete(0, 1);
          requestsArray.insert(0, [
            {
              ...req,
              status: 'answered',
              response: '4',
              answeredAt: Date.now(),
              answeredBy: 'test-user',
            },
          ]);
        });
      }, 10);

      const result = await responsePromise;
      expect(result.success).toBe(true);
      expect(result.status).toBe('answered');
      if (result.status === 'answered') {
        expect(result.response).toBe('4');
      }
    });
  });

  describe('integration: multiline input lifecycle', () => {
    it('creates multiline request, waits, receives answer', async () => {
      const requestId = manager.createRequest(ydoc, {
        message: 'Describe the issue in detail',
        type: 'multiline',
        defaultValue: 'Default description',
      });

      expect(requestId).toBeDefined();
      const request = manager.getRequest(ydoc, requestId);
      expect(request?.type).toBe('multiline');
      expect(request?.defaultValue).toBe('Default description');

      const responsePromise = manager.waitForResponse(ydoc, requestId, 10);

      setTimeout(() => {
        ydoc.transact(() => {
          const requestsArray = ydoc.getArray(YDOC_KEYS.INPUT_REQUESTS);
          const req = requestsArray.get(0) as any;
          requestsArray.delete(0, 1);
          requestsArray.insert(0, [
            {
              ...req,
              status: 'answered',
              response: 'This is a detailed\nmultiline\nresponse',
              answeredAt: Date.now(),
              answeredBy: 'test-user',
            },
          ]);
        });
      }, 10);

      const result = await responsePromise;
      expect(result.success).toBe(true);
      expect(result.status).toBe('answered');
      if (result.status === 'answered') {
        expect(result.response).toBe('This is a detailed\nmultiline\nresponse');
      }
    });
  });

  describe('integration: confirm input lifecycle', () => {
    it('creates confirm request, waits, receives answer', async () => {
      const requestId = manager.createRequest(ydoc, {
        message: 'Are you sure you want to proceed?',
        type: 'confirm',
      });

      expect(requestId).toBeDefined();
      const request = manager.getRequest(ydoc, requestId);
      expect(request?.type).toBe('confirm');

      const responsePromise = manager.waitForResponse(ydoc, requestId, 10);

      setTimeout(() => {
        ydoc.transact(() => {
          const requestsArray = ydoc.getArray(YDOC_KEYS.INPUT_REQUESTS);
          const req = requestsArray.get(0) as any;
          requestsArray.delete(0, 1);
          requestsArray.insert(0, [
            {
              ...req,
              status: 'answered',
              response: 'yes',
              answeredAt: Date.now(),
              answeredBy: 'test-user',
            },
          ]);
        });
      }, 10);

      const result = await responsePromise;
      expect(result.success).toBe(true);
      expect(result.status).toBe('answered');
      if (result.status === 'answered') {
        expect(result.response).toBe('yes');
      }
    });

    it('handles confirm request declined', async () => {
      const requestId = manager.createRequest(ydoc, {
        message: 'Delete all files?',
        type: 'confirm',
      });

      const responsePromise = manager.waitForResponse(ydoc, requestId, 10);

      setTimeout(() => {
        ydoc.transact(() => {
          const requestsArray = ydoc.getArray(YDOC_KEYS.INPUT_REQUESTS);
          const req = requestsArray.get(0) as any;
          requestsArray.delete(0, 1);
          requestsArray.insert(0, [
            {
              ...req,
              status: 'declined',
              answeredAt: Date.now(),
              answeredBy: 'test-user',
            },
          ]);
        });
      }, 10);

      const result = await responsePromise;
      expect(result.success).toBe(true);
      expect(result.status).toBe('declined');
      if (result.status === 'declined') {
        expect(result.reason).toBe('User declined to answer');
      }
    });
  });
});
