/**
 * Tests for input-request.ts
 *
 * Tests the requestUserInput function that allows agents to request
 * input from users via browser modals.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MultiQuestionOptions, Question, SingleQuestionOptions } from './input-request.js';

// Mock the logger
vi.mock('../../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock the generateInputRequestId
vi.mock('@shipyard/loro-schema', async () => {
  const actual = await vi.importActual('@shipyard/loro-schema');
  return {
    ...actual,
    generateInputRequestId: vi.fn(() => 'test-request-id'),
  };
});

// Test helper to create a mock room doc
function createMockRoomDoc(taskId: string) {
  const inboxEvents: Array<unknown> = [];
  const taskIndexEntry = {
    taskId,
    hasPendingRequests: false,
    lastUpdated: Date.now(),
    inboxEvents: {
      push: (evt: unknown) => inboxEvents.push(evt),
      toJSON: () => inboxEvents,
    },
  };
  const taskIndex = new Map<string, typeof taskIndexEntry>();
  taskIndex.set(taskId, taskIndexEntry);

  return {
    taskIndex: {
      get: (id: string) => taskIndex.get(id),
      set: (id: string, value: typeof taskIndexEntry) => taskIndex.set(id, value),
    },
  };
}

// Test helper to create a mock task doc
function createMockTaskDoc(_taskId: string) {
  const inputRequests: Array<Record<string, unknown>> = [];
  const events: Array<Record<string, unknown>> = [];

  return {
    meta: {
      ownerId: 'test-owner',
    },
    inputRequests: {
      push: (req: unknown) => inputRequests.push(req as Record<string, unknown>),
      toJSON: () => inputRequests,
      get: (idx: number) => {
        const item = inputRequests[idx];
        if (!item) return undefined;
        return {
          get status() {
            return item.status as string;
          },
          set status(v: string) {
            item.status = v;
          },
          get response() {
            return item.response;
          },
          set response(v: unknown) {
            item.response = v;
          },
        };
      },
    },
    events: {
      push: (evt: unknown) => events.push(evt as Record<string, unknown>),
      toJSON: () => events,
    },
    _rawInputRequests: inputRequests,
  };
}

// Create a mock repo that returns task and room docs
function createMockRepo(
  _taskId: string,
  taskDoc: ReturnType<typeof createMockTaskDoc>,
  roomDoc: ReturnType<typeof createMockRoomDoc>
) {
  return {
    get: vi.fn((id: string, _schema: unknown) => {
      if (id === 'room') {
        return { doc: roomDoc };
      }
      return { doc: taskDoc };
    }),
  };
}

// Mock the getRepo function
vi.mock('../../loro/repo.js', () => ({
  getRepo: vi.fn(),
}));

// Import after mocks
import { getRepo } from '../../loro/repo.js';
import { requestUserInput } from './input-request.js';

/**
 * Helper to set mock request status and response.
 * Uses a local variable to satisfy TypeScript's narrowing.
 */
function setMockRequestAnswer(
  requests: Array<Record<string, unknown>>,
  status: string,
  response?: unknown,
  responses?: Record<string, unknown>
): void {
  const req = requests[0];
  if (req) {
    req.status = status;
    if (response !== undefined) {
      req.response = response;
    }
    if (responses !== undefined) {
      req.responses = responses;
    }
  }
}

describe('input-request', () => {
  let mockTaskDoc: ReturnType<typeof createMockTaskDoc>;
  let mockRoomDoc: ReturnType<typeof createMockRoomDoc>;
  let mockRepo: ReturnType<typeof createMockRepo>;
  const testTaskId = 'test-task-123';

  beforeEach(() => {
    vi.clearAllMocks();
    mockTaskDoc = createMockTaskDoc(testTaskId);
    mockRoomDoc = createMockRoomDoc(testTaskId);
    mockRepo = createMockRepo(testTaskId, mockTaskDoc, mockRoomDoc);
    vi.mocked(getRepo).mockReturnValue(mockRepo as unknown as ReturnType<typeof getRepo>);
  });

  describe('single question input requests', () => {
    it('should create a text input request with correct structure', async () => {
      const opts: SingleQuestionOptions = {
        taskId: testTaskId,
        message: 'What is your name?',
        type: 'text',
        defaultValue: 'John',
        placeholder: 'Enter name',
        timeout: 1,
      };

      // Simulate user answering after 100ms
      setTimeout(() => {
        setMockRequestAnswer(mockTaskDoc._rawInputRequests, 'answered', 'Alice');
      }, 100);

      const result = await requestUserInput(opts);

      expect(result.success).toBe(true);
      expect(result.status).toBe('answered');
      expect(result.response).toBe('Alice');

      // Verify the request was created with correct structure
      const requests = mockTaskDoc._rawInputRequests;
      expect(requests).toHaveLength(1);
      expect(requests[0]).toMatchObject({
        type: 'text',
        id: 'test-request-id',
        message: 'What is your name?',
        defaultValue: 'John',
        placeholder: 'Enter name',
        status: 'answered',
      });
    });

    it('should create a choice input request with options in label/value format', async () => {
      const opts: SingleQuestionOptions = {
        taskId: testTaskId,
        message: 'Choose a color',
        type: 'choice',
        options: ['Red', 'Green', 'Blue'],
        multiSelect: true,
        displayAs: 'checkbox',
        timeout: 1,
      };

      setTimeout(() => {
        setMockRequestAnswer(mockTaskDoc._rawInputRequests, 'answered', 'Blue');
      }, 100);

      const result = await requestUserInput(opts);

      expect(result.success).toBe(true);
      expect(result.response).toBe('Blue');

      const requests = mockTaskDoc._rawInputRequests;
      expect(requests[0]).toMatchObject({
        type: 'choice',
        message: 'Choose a color',
        options: [
          { label: 'Red', value: 'Red', description: null },
          { label: 'Green', value: 'Green', description: null },
          { label: 'Blue', value: 'Blue', description: null },
        ],
        multiSelect: true,
        displayAs: 'checkbox',
      });
    });

    it('should create a number input request with min/max', async () => {
      const opts: SingleQuestionOptions = {
        taskId: testTaskId,
        message: 'Enter a number',
        type: 'number',
        min: 1,
        max: 100,
        format: 'integer',
        defaultValue: '50',
        timeout: 1,
      };

      setTimeout(() => {
        setMockRequestAnswer(mockTaskDoc._rawInputRequests, 'answered', 42);
      }, 100);

      const result = await requestUserInput(opts);

      expect(result.success).toBe(true);
      expect(result.response).toBe(42);

      const requests = mockTaskDoc._rawInputRequests;
      expect(requests[0]).toMatchObject({
        type: 'number',
        message: 'Enter a number',
        min: 1,
        max: 100,
        format: 'integer',
        defaultValue: 50,
      });
    });

    it('should create a confirm input request', async () => {
      const opts: SingleQuestionOptions = {
        taskId: testTaskId,
        message: 'Are you sure?',
        type: 'confirm',
        isBlocker: true,
        timeout: 1,
      };

      setTimeout(() => {
        setMockRequestAnswer(mockTaskDoc._rawInputRequests, 'answered', 'yes');
      }, 100);

      const result = await requestUserInput(opts);

      expect(result.success).toBe(true);
      expect(result.response).toBe('yes');

      const requests = mockTaskDoc._rawInputRequests;
      expect(requests[0]).toMatchObject({
        type: 'confirm',
        message: 'Are you sure?',
        isBlocker: true,
      });
    });

    it('should create a multiline input request', async () => {
      const opts: SingleQuestionOptions = {
        taskId: testTaskId,
        message: 'Enter description',
        type: 'multiline',
        defaultValue: 'Default text',
        placeholder: 'Type here...',
        timeout: 1,
      };

      setTimeout(() => {
        setMockRequestAnswer(mockTaskDoc._rawInputRequests, 'answered', 'Multi\nline\ntext');
      }, 100);

      const result = await requestUserInput(opts);

      expect(result.success).toBe(true);
      expect(result.response).toBe('Multi\nline\ntext');

      const requests = mockTaskDoc._rawInputRequests;
      expect(requests[0]).toMatchObject({
        type: 'multiline',
        message: 'Enter description',
        defaultValue: 'Default text',
        placeholder: 'Type here...',
      });
    });

    it('should return declined status when user declines', async () => {
      const opts: SingleQuestionOptions = {
        taskId: testTaskId,
        message: 'Test question',
        type: 'text',
        timeout: 1,
      };

      setTimeout(() => {
        setMockRequestAnswer(mockTaskDoc._rawInputRequests, 'declined');
      }, 100);

      const result = await requestUserInput(opts);

      expect(result).toEqual({
        success: false,
        status: 'declined',
        reason: 'User declined to answer',
      });
    });

    it('should return cancelled status when request is cancelled', async () => {
      const opts: SingleQuestionOptions = {
        taskId: testTaskId,
        message: 'Test question',
        type: 'text',
        timeout: 1,
      };

      setTimeout(() => {
        setMockRequestAnswer(mockTaskDoc._rawInputRequests, 'cancelled');
      }, 100);

      const result = await requestUserInput(opts);

      expect(result).toEqual({
        success: false,
        status: 'cancelled',
        reason: 'Request was cancelled',
      });
    });

    it('should return cancelled when request is deleted', async () => {
      const opts: SingleQuestionOptions = {
        taskId: testTaskId,
        message: 'Test question',
        type: 'text',
        timeout: 1,
      };

      // Delete the request after creation
      setTimeout(() => {
        mockTaskDoc._rawInputRequests.length = 0;
      }, 100);

      const result = await requestUserInput(opts);

      expect(result).toEqual({
        success: false,
        status: 'cancelled',
        reason: 'Request was deleted or not found',
      });
    });

    it('should fallback to text type for unsupported types', async () => {
      const opts: SingleQuestionOptions = {
        taskId: testTaskId,
        message: 'Enter email',
        type: 'email', // Not directly supported in Loro schema
        timeout: 1,
      };

      setTimeout(() => {
        setMockRequestAnswer(mockTaskDoc._rawInputRequests, 'answered', 'test@example.com');
      }, 100);

      const result = await requestUserInput(opts);

      expect(result.success).toBe(true);

      const requests = mockTaskDoc._rawInputRequests;
      // Should fallback to text type
      expect(requests[0]?.type).toBe('text');
    });
  });

  describe('multi-question input requests', () => {
    it('should create a multi-question input request', async () => {
      const questions: Question[] = [
        { type: 'text', message: 'What is your name?' },
        { type: 'number', message: 'What is your age?', min: 0, max: 150 },
        {
          type: 'choice',
          message: 'Choose your favorite color',
          options: ['Red', 'Green', 'Blue'],
        },
      ];

      const opts: MultiQuestionOptions = {
        taskId: testTaskId,
        questions,
        timeout: 1,
        isBlocker: true,
      };

      setTimeout(() => {
        setMockRequestAnswer(mockTaskDoc._rawInputRequests, 'answered', undefined, {
          '0': 'Alice',
          '1': '30',
          '2': 'Blue',
        });
      }, 100);

      const result = await requestUserInput(opts);

      expect(result.success).toBe(true);
      expect(result.response).toEqual({
        '0': 'Alice',
        '1': '30',
        '2': 'Blue',
      });

      const requests = mockTaskDoc._rawInputRequests;
      expect(requests[0]).toMatchObject({
        type: 'multi',
        message: 'What is your name?',
        isBlocker: true,
        questions: expect.arrayContaining([
          expect.objectContaining({
            type: 'text',
            message: 'What is your name?',
          }),
          expect.objectContaining({
            type: 'number',
            message: 'What is your age?',
            min: 0,
            max: 150,
          }),
          expect.objectContaining({
            type: 'choice',
            message: 'Choose your favorite color',
          }),
        ]),
      });
    });

    it('should return cancelled when no valid questions provided', async () => {
      const opts: MultiQuestionOptions = {
        taskId: testTaskId,
        questions: [],
        timeout: 1,
      };

      const result = await requestUserInput(opts);

      expect(result).toEqual({
        success: false,
        status: 'cancelled',
        reason: 'No valid questions provided',
      });
    });

    it('should filter out null/undefined questions', async () => {
      const questions = [
        { type: 'text' as const, message: 'Valid question' },
        null,
        undefined,
      ] as Question[];

      const opts: MultiQuestionOptions = {
        taskId: testTaskId,
        questions,
        timeout: 1,
      };

      setTimeout(() => {
        setMockRequestAnswer(mockTaskDoc._rawInputRequests, 'answered', undefined, {
          '0': 'Answer',
        });
      }, 100);

      const result = await requestUserInput(opts);

      expect(result.success).toBe(true);

      const requests = mockTaskDoc._rawInputRequests;
      // Should only have 1 valid question
      expect(requests[0]?.questions).toHaveLength(1);
    });
  });

  describe('timeout handling', () => {
    it('should use minimum timeout (300s) when provided value is too low', async () => {
      const startTime = Date.now();
      const opts: SingleQuestionOptions = {
        taskId: testTaskId,
        message: 'Test',
        type: 'text',
        timeout: 1, // 1 second, way below minimum
      };

      // Answer immediately
      setTimeout(() => {
        setMockRequestAnswer(mockTaskDoc._rawInputRequests, 'answered', 'test');
      }, 50);

      await requestUserInput(opts);

      const requests = mockTaskDoc._rawInputRequests;
      // expiresAt should be at least 300 seconds from when we started (minus some tolerance for test execution)
      const minExpected = startTime + 298 * 1000;
      expect(requests[0]?.expiresAt).toBeGreaterThan(minExpected);
    });

    it('should use maximum timeout (14400s) when provided value is too high', async () => {
      const opts: SingleQuestionOptions = {
        taskId: testTaskId,
        message: 'Test',
        type: 'text',
        timeout: 100000, // Way above maximum
      };

      setTimeout(() => {
        setMockRequestAnswer(mockTaskDoc._rawInputRequests, 'answered', 'test');
      }, 50);

      await requestUserInput(opts);

      const requests = mockTaskDoc._rawInputRequests;
      // Maximum is 14400 seconds (4 hours)
      const maxExpected = Date.now() + 14401 * 1000;
      expect(requests[0]?.expiresAt).toBeLessThanOrEqual(maxExpected);
    });
  });

  describe('taskId requirement', () => {
    it('should have taskId as required in SingleQuestionOptions', () => {
      // TypeScript compile-time check - this would fail to compile if taskId was optional
      const opts: SingleQuestionOptions = {
        taskId: 'required-task-id',
        message: 'Test',
        type: 'text',
      };
      expect(opts.taskId).toBe('required-task-id');
    });

    it('should have taskId as required in MultiQuestionOptions', () => {
      // TypeScript compile-time check
      const opts: MultiQuestionOptions = {
        taskId: 'required-task-id',
        questions: [{ type: 'text', message: 'Test' }],
      };
      expect(opts.taskId).toBe('required-task-id');
    });
  });

  describe('repo integration', () => {
    it('should call getRepo and get task/room documents', async () => {
      const opts: SingleQuestionOptions = {
        taskId: testTaskId,
        message: 'Test',
        type: 'text',
        timeout: 1,
      };

      setTimeout(() => {
        setMockRequestAnswer(mockTaskDoc._rawInputRequests, 'answered', 'test');
      }, 50);

      await requestUserInput(opts);

      expect(getRepo).toHaveBeenCalled();
      expect(mockRepo.get).toHaveBeenCalledWith(testTaskId, expect.anything());
      expect(mockRepo.get).toHaveBeenCalledWith('room', expect.anything());
    });
  });
});
