import { describe, expect, it } from 'vitest';
import { createInputRequest, InputRequestSchema } from './input-request.js';

describe('InputRequestSchema validation', () => {
  describe('message validation', () => {
    it('should reject empty message strings', () => {
      const result = InputRequestSchema.safeParse({
        id: 'test-id',
        createdAt: Date.now(),
        message: '',
        type: 'text',
        status: 'pending',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe('Message cannot be empty');
      }
    });

    it('should accept non-empty messages', () => {
      const result = InputRequestSchema.safeParse({
        id: 'test-id',
        createdAt: Date.now(),
        message: 'Valid message',
        type: 'text',
        status: 'pending',
      });

      expect(result.success).toBe(true);
    });
  });

  describe('timeout validation', () => {
    it('should reject negative timeouts', () => {
      const result = InputRequestSchema.safeParse({
        id: 'test-id',
        createdAt: Date.now(),
        message: 'Test',
        type: 'text',
        status: 'pending',
        timeout: -1,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe('Timeout must be at least 10 seconds');
      }
    });

    it('should reject timeouts less than 10 seconds', () => {
      const result = InputRequestSchema.safeParse({
        id: 'test-id',
        createdAt: Date.now(),
        message: 'Test',
        type: 'text',
        status: 'pending',
        timeout: 5,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe('Timeout must be at least 10 seconds');
      }
    });

    it('should reject timeouts exceeding 14400 seconds (4 hours)', () => {
      const result = InputRequestSchema.safeParse({
        id: 'test-id',
        createdAt: Date.now(),
        message: 'Test',
        type: 'text',
        status: 'pending',
        timeout: 15000,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe('Timeout cannot exceed 4 hours');
      }
    });

    it('should reject non-integer timeouts', () => {
      const result = InputRequestSchema.safeParse({
        id: 'test-id',
        createdAt: Date.now(),
        message: 'Test',
        type: 'text',
        status: 'pending',
        timeout: 30.5,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain('expected int');
      }
    });

    it('should accept valid timeout values', () => {
      const validTimeouts = [10, 30, 60, 300, 1800, 14400];

      for (const timeout of validTimeouts) {
        const result = InputRequestSchema.safeParse({
          id: 'test-id',
          createdAt: Date.now(),
          message: 'Test',
          type: 'text',
          status: 'pending',
          timeout,
        });

        expect(result.success).toBe(true);
      }
    });

    it('should accept undefined timeout (optional field)', () => {
      const result = InputRequestSchema.safeParse({
        id: 'test-id',
        createdAt: Date.now(),
        message: 'Test',
        type: 'text',
        status: 'pending',
      });

      expect(result.success).toBe(true);
    });
  });
});

describe('createInputRequest', () => {
  it('should throw error for empty message', () => {
    expect(() => {
      createInputRequest({ message: '', type: 'text' });
    }).toThrow();
  });

  it('should throw error for negative timeout', () => {
    expect(() => {
      createInputRequest({ message: 'Test', type: 'text', timeout: -1 });
    }).toThrow();
  });

  it('should throw error for timeout exceeding max', () => {
    expect(() => {
      createInputRequest({ message: 'Test', type: 'text', timeout: 15000 });
    }).toThrow();
  });

  it('should create valid request with valid inputs', () => {
    const request = createInputRequest({
      message: 'Test message',
      type: 'text',
      timeout: 60,
    });

    expect(request.message).toBe('Test message');
    expect(request.type).toBe('text');
    expect(request.timeout).toBe(60);
    expect(request.status).toBe('pending');
    expect(request.id).toBeDefined();
    expect(request.createdAt).toBeDefined();
  });
});
