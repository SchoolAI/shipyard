import { EPOCH_CLOSE_CODES, EPOCH_CLOSE_REASONS } from '@shipyard/schema';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.useFakeTimers();

describe('epochReset utilities', () => {
  let isEpochRejection: typeof import('./epochReset').isEpochRejection;
  let handleEpochRejection: typeof import('./epochReset').handleEpochRejection;

  const mockDeleteDatabase = vi.fn();
  const mockReload = vi.fn();

  beforeEach(async () => {
    vi.resetModules();

    (globalThis as { indexedDB: typeof indexedDB }).indexedDB = {
      deleteDatabase: mockDeleteDatabase,
    } as unknown as typeof indexedDB;

    Object.defineProperty(window, 'location', {
      writable: true,
      value: { reload: mockReload },
    });

    const module = await import('./epochReset');
    isEpochRejection = module.isEpochRejection;
    handleEpochRejection = module.handleEpochRejection;

    mockDeleteDatabase.mockReset();
    mockReload.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('isEpochRejection', () => {
    it('should return true for EPOCH_TOO_OLD code', () => {
      expect(isEpochRejection(EPOCH_CLOSE_CODES.EPOCH_TOO_OLD)).toBe(true);
    });

    it('should return true for epoch_too_old reason', () => {
      expect(isEpochRejection(1000, EPOCH_CLOSE_REASONS[EPOCH_CLOSE_CODES.EPOCH_TOO_OLD])).toBe(
        true
      );
    });

    it('should return true when both code and reason match', () => {
      expect(
        isEpochRejection(
          EPOCH_CLOSE_CODES.EPOCH_TOO_OLD,
          EPOCH_CLOSE_REASONS[EPOCH_CLOSE_CODES.EPOCH_TOO_OLD]
        )
      ).toBe(true);
    });

    it('should return false for normal close code 1000', () => {
      expect(isEpochRejection(1000)).toBe(false);
    });

    it('should return false for other close codes', () => {
      expect(isEpochRejection(1001)).toBe(false);
      expect(isEpochRejection(4000)).toBe(false);
    });

    it('should return false for undefined reason', () => {
      expect(isEpochRejection(1000, undefined)).toBe(false);
    });

    it('should return false for wrong reason string', () => {
      expect(isEpochRejection(1000, 'other_reason')).toBe(false);
    });
  });

  describe('handleEpochRejection', () => {
    it('should delete the plan IndexedDB database and reload', async () => {
      mockDeleteDatabase.mockImplementation(() => {
        const request = {
          onsuccess: null as (() => void) | null,
          onerror: null,
          onblocked: null,
        };
        setTimeout(() => {
          request.onsuccess?.();
        }, 0);
        return request;
      });

      const promise = handleEpochRejection('test-plan-id');
      await vi.runAllTimersAsync();
      await promise;

      expect(mockDeleteDatabase).toHaveBeenCalledWith('test-plan-id');
      expect(mockReload).toHaveBeenCalled();
    });

    it('should reload even if database deletion times out', async () => {
      mockDeleteDatabase.mockImplementation(() => {
        return {
          onsuccess: null,
          onerror: null,
          onblocked: null,
        };
      });

      const promise = handleEpochRejection('test-plan-id');
      await vi.advanceTimersByTimeAsync(5000);
      await promise;

      expect(mockReload).toHaveBeenCalled();
    });

    it('should reload even if database deletion fails', async () => {
      mockDeleteDatabase.mockImplementation(() => {
        const request = {
          onsuccess: null,
          onerror: null as ((this: IDBOpenDBRequest, ev: Event) => void) | null,
          onblocked: null,
          error: { message: 'test error' },
        };
        setTimeout(() => {
          request.onerror?.call(request as IDBOpenDBRequest, {} as Event);
        }, 0);
        return request;
      });

      const promise = handleEpochRejection('test-plan-id');
      await vi.runAllTimersAsync();
      await promise;

      expect(mockReload).toHaveBeenCalled();
    });
  });
});
