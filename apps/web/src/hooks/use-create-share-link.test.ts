import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCreateShareLink } from './use-create-share-link';

vi.mock('../stores', () => ({
  useAuthStore: vi.fn(),
}));

import { useAuthStore } from '../stores';

const mockUseAuthStore = vi.mocked(useAuthStore);

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            url: 'http://localhost:4444/collab/join?token=abc',
            roomId: 'room-1',
            expiresAt: 9999999999,
          }),
        text: () => Promise.resolve(''),
      })
    )
  );

  vi.stubEnv('VITE_SESSION_SERVER_URL', 'http://localhost:4444');

  mockUseAuthStore.mockImplementation((selector) =>
    (selector as (s: unknown) => unknown)({ token: 'test-token' })
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('useCreateShareLink', () => {
  it('returns initial state (shareUrl null, isLoading false, no error)', () => {
    const { result } = renderHook(() => useCreateShareLink({ taskId: 'task-1' }));

    expect(result.current.shareUrl).toBeNull();
    expect(result.current.roomId).toBeNull();
    expect(result.current.expiresAt).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(typeof result.current.createShareLink).toBe('function');
    expect(typeof result.current.reset).toBe('function');
  });

  it('sets error when taskId is null', async () => {
    const { result } = renderHook(() => useCreateShareLink({ taskId: null }));

    await act(async () => {
      await result.current.createShareLink(60);
    });

    expect(result.current.error).toBe('No task selected');
    expect(result.current.isLoading).toBe(false);
  });

  it('sets error when authToken is missing', async () => {
    mockUseAuthStore.mockImplementation((selector) =>
      (selector as (s: unknown) => unknown)({ token: null })
    );

    const { result } = renderHook(() => useCreateShareLink({ taskId: 'task-1' }));

    await act(async () => {
      await result.current.createShareLink(60);
    });

    expect(result.current.error).toBe('Not authenticated');
    expect(result.current.isLoading).toBe(false);
  });

  it('calls fetch with correct params when valid', async () => {
    const { result } = renderHook(() => useCreateShareLink({ taskId: 'task-1' }));

    await act(async () => {
      await result.current.createShareLink(30);
    });

    expect(fetch).toHaveBeenCalledWith('http://localhost:4444/collab/create', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ taskId: 'task-1', expiresInMinutes: 30 }),
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.shareUrl).toContain('/collab/room-1');
    expect(result.current.roomId).toBe('room-1');
    expect(result.current.expiresAt).toBe(9999999999);
  });

  it('sets error on fetch failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 500,
          text: () => Promise.resolve('Internal Server Error'),
        })
      )
    );

    const { result } = renderHook(() => useCreateShareLink({ taskId: 'task-1' }));

    await act(async () => {
      await result.current.createShareLink(60);
    });

    expect(result.current.error).toBe('Internal Server Error');
    expect(result.current.isLoading).toBe(false);
    expect(result.current.shareUrl).toBeNull();
  });

  it('reset clears all state', async () => {
    const { result } = renderHook(() => useCreateShareLink({ taskId: 'task-1' }));

    await act(async () => {
      await result.current.createShareLink(30);
    });

    expect(result.current.shareUrl).not.toBeNull();

    act(() => {
      result.current.reset();
    });

    expect(result.current.shareUrl).toBeNull();
    expect(result.current.roomId).toBeNull();
    expect(result.current.expiresAt).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });
});
