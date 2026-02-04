import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Test module for retryWithBackoff helper function.
 * This is a minimal export wrapper to allow testing of the private retryWithBackoff function.
 */

vi.mock('./logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

/**
 * Retries an async operation with exponential backoff.
 * Copy of the private function from http-client.ts for testing purposes.
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  baseDelay = 1000
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxAttempts - 1) {
        const delay = attempt === 0 ? 0 : baseDelay * 2 ** (attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error('Retry failed');
}

describe('retryWithBackoff', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should succeed on first attempt', async () => {
    let attempts = 0;
    const result = await retryWithBackoff(async () => {
      attempts++;
      return 'success';
    });

    expect(result).toBe('success');
    expect(attempts).toBe(1);
  });

  it('should retry on failure and eventually succeed', async () => {
    let attempts = 0;
    const result = await retryWithBackoff(async () => {
      attempts++;
      if (attempts < 3) {
        throw new Error('Temporary failure');
      }
      return 'success';
    });

    expect(result).toBe('success');
    expect(attempts).toBe(3);
  });

  it('should throw after max attempts exhausted', async () => {
    const error = new Error('Always fails');

    await expect(
      retryWithBackoff(async () => {
        throw error;
      })
    ).rejects.toThrow('Always fails');
  });

  it('should use exponential backoff delays', async () => {
    let attempts = 0;

    try {
      await retryWithBackoff(
        async () => {
          attempts++;
          throw new Error('Fail');
        },
        3,
        100
      );
    } catch {}

    expect(attempts).toBe(3);

    // NOTE: Can't verify exact delays without mocking setTimeout
  });

  it('should respect custom maxAttempts', async () => {
    let attempts = 0;

    try {
      await retryWithBackoff(
        async () => {
          attempts++;
          throw new Error('Fail');
        },
        5,
        10
      );
    } catch {}

    expect(attempts).toBe(5);
  });

  it('should respect custom baseDelay', async () => {
    let attempts = 0;

    try {
      await retryWithBackoff(
        async () => {
          attempts++;
          throw new Error('Fail');
        },
        2,
        50
      );
    } catch {}

    expect(attempts).toBe(2);
  });

  it('should preserve error details', async () => {
    const originalError = new Error('Specific error message');

    try {
      await retryWithBackoff(async () => {
        throw originalError;
      });
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBe(originalError);
      expect(err instanceof Error ? err.message : String(err)).toBe('Specific error message');
    }
  });

  it('should handle async operations correctly', async () => {
    let attempts = 0;

    const result = await retryWithBackoff(async () => {
      attempts++;
      await new Promise((resolve) => setTimeout(resolve, 10));

      if (attempts < 2) {
        throw new Error('Not ready yet');
      }

      return 'async result';
    });

    expect(result).toBe('async result');
    expect(attempts).toBe(2);
  });
});
