import type {
  WorktreeCreateRequestEphemeralValue,
  WorktreeCreateResponseEphemeralValue,
} from '@shipyard/loro-schema';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCreateWorktree } from './use-create-worktree';
import type { RoomHandle } from './use-room-handle';

type EphemeralSubscribeCb = (event: {
  key: string;
  value: WorktreeCreateResponseEphemeralValue | undefined;
  source: 'local' | 'remote' | 'initial';
}) => void;

function createMockRoomHandle() {
  const reqSets = new Map<string, WorktreeCreateRequestEphemeralValue>();
  const reqDeletes = new Set<string>();
  const respDeletes = new Set<string>();
  const respSubscribers = new Set<EphemeralSubscribeCb>();

  const handle = {
    worktreeCreateReqs: {
      set: vi.fn((key: string, value: WorktreeCreateRequestEphemeralValue) => {
        reqSets.set(key, value);
      }),
      delete: vi.fn((key: string) => {
        reqDeletes.add(key);
      }),
    },
    worktreeCreateResps: {
      subscribe: vi.fn((cb: EphemeralSubscribeCb) => {
        respSubscribers.add(cb);
        return () => respSubscribers.delete(cb);
      }),
      delete: vi.fn((key: string) => {
        respDeletes.add(key);
      }),
    },
  } as unknown as RoomHandle;

  return {
    handle,
    reqSets,
    reqDeletes,
    respDeletes,
    respSubscribers,
    emitResponse(key: string, value: WorktreeCreateResponseEphemeralValue) {
      for (const cb of respSubscribers) {
        cb({ key, value, source: 'remote' });
      }
    },
    emitLocalEcho(key: string, value: WorktreeCreateResponseEphemeralValue) {
      for (const cb of respSubscribers) {
        cb({ key, value, source: 'local' });
      }
    },
    getLastRequestId(): string {
      const calls = (handle.worktreeCreateReqs.set as ReturnType<typeof vi.fn>).mock.calls;
      const last = calls[calls.length - 1];
      return last ? (last[0] as string) : '';
    },
  };
}

const DEFAULT_PARAMS = {
  sourceRepoPath: '/repo',
  branchName: 'feat/test',
  baseRef: 'main',
  setupScript: null,
};

function setup(overrides: { machineId?: string | null; handle?: RoomHandle | null } = {}) {
  const mock = overrides.handle !== undefined ? null : createMockRoomHandle();
  const roomHandle = overrides.handle !== undefined ? overrides.handle : mock!.handle;
  const machineId = 'machineId' in overrides ? (overrides.machineId ?? null) : 'machine-1';
  const hook = renderHook(() =>
    useCreateWorktree({
      roomHandle,
      machineId,
    })
  );
  return { mock, ...hook };
}

describe('useCreateWorktree', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts idle', () => {
    const { result } = setup();
    expect(result.current.isCreating).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('writes request to worktreeCreateReqs ephemeral on createWorktree()', () => {
    const { mock, result } = setup();
    const callbacks = { onProgress: vi.fn(), onDone: vi.fn(), onError: vi.fn() };

    act(() => result.current.createWorktree(DEFAULT_PARAMS, callbacks));

    expect(mock!.handle.worktreeCreateReqs.set).toHaveBeenCalledOnce();
    const [key, value] = (mock!.handle.worktreeCreateReqs.set as ReturnType<typeof vi.fn>).mock
      .calls[0]!;
    expect(typeof key).toBe('string');
    expect(value).toMatchObject({
      machineId: 'machine-1',
      sourceRepoPath: '/repo',
      branchName: 'feat/test',
      baseRef: 'main',
    });
    expect(typeof value.requestedAt).toBe('number');
  });

  it('subscribes to worktreeCreateResps before writing request', () => {
    const { mock, result } = setup();
    const callbacks = { onProgress: vi.fn(), onDone: vi.fn(), onError: vi.fn() };

    act(() => result.current.createWorktree(DEFAULT_PARAMS, callbacks));

    const subscribeOrder = (mock!.handle.worktreeCreateResps.subscribe as ReturnType<typeof vi.fn>)
      .mock.invocationCallOrder[0];
    const setOrder = (mock!.handle.worktreeCreateReqs.set as ReturnType<typeof vi.fn>).mock
      .invocationCallOrder[0];

    expect(subscribeOrder).toBeDefined();
    expect(setOrder).toBeDefined();
    expect(subscribeOrder!).toBeLessThan(setOrder!);
  });

  it('dispatches onProgress for progress updates', () => {
    const { mock, result } = setup();
    const callbacks = { onProgress: vi.fn(), onDone: vi.fn(), onError: vi.fn() };

    act(() => result.current.createWorktree(DEFAULT_PARAMS, callbacks));
    const requestId = mock!.getLastRequestId();

    act(() =>
      mock!.emitResponse(requestId, {
        status: 'creating-worktree',
        detail: 'Initializing',
        worktreePath: null,
        branchName: null,
        setupScriptStarted: null,
        warnings: null,
        error: null,
      })
    );

    expect(callbacks.onProgress).toHaveBeenCalledWith({
      step: 'creating-worktree',
      detail: 'Initializing',
    });
  });

  it('dispatches onDone for completion', () => {
    const { mock, result } = setup();
    const callbacks = { onProgress: vi.fn(), onDone: vi.fn(), onError: vi.fn() };

    act(() => result.current.createWorktree(DEFAULT_PARAMS, callbacks));
    const requestId = mock!.getLastRequestId();

    act(() =>
      mock!.emitResponse(requestId, {
        status: 'done',
        detail: null,
        worktreePath: '/repo-feat-test',
        branchName: 'feat/test',
        setupScriptStarted: false,
        warnings: ['some warning'],
        error: null,
      })
    );

    expect(callbacks.onDone).toHaveBeenCalledWith({
      worktreePath: '/repo-feat-test',
      branchName: 'feat/test',
      setupScriptStarted: false,
      warnings: ['some warning'],
      requestId: expect.any(String),
    });
    expect(result.current.isCreating).toBe(false);
  });

  it('dispatches onError for errors', () => {
    const { mock, result } = setup();
    const callbacks = { onProgress: vi.fn(), onDone: vi.fn(), onError: vi.fn() };

    act(() => result.current.createWorktree(DEFAULT_PARAMS, callbacks));
    const requestId = mock!.getLastRequestId();

    act(() =>
      mock!.emitResponse(requestId, {
        status: 'error',
        detail: null,
        worktreePath: null,
        branchName: null,
        setupScriptStarted: null,
        warnings: null,
        error: 'Branch already exists',
      })
    );

    expect(callbacks.onError).toHaveBeenCalledWith('Branch already exists');
    expect(result.current.isCreating).toBe(false);
    expect(result.current.error).toBe('Branch already exists');
  });

  it('ignores local echo (source === "local")', () => {
    const { mock, result } = setup();
    const callbacks = { onProgress: vi.fn(), onDone: vi.fn(), onError: vi.fn() };

    act(() => result.current.createWorktree(DEFAULT_PARAMS, callbacks));
    const requestId = mock!.getLastRequestId();

    act(() =>
      mock!.emitLocalEcho(requestId, {
        status: 'creating-worktree',
        detail: 'Should be ignored',
        worktreePath: null,
        branchName: null,
        setupScriptStarted: null,
        warnings: null,
        error: null,
      })
    );

    expect(callbacks.onProgress).not.toHaveBeenCalled();
  });

  it('cancel() deletes the request from ephemeral', () => {
    const { mock, result } = setup();
    const callbacks = { onProgress: vi.fn(), onDone: vi.fn(), onError: vi.fn() };

    act(() => result.current.createWorktree(DEFAULT_PARAMS, callbacks));
    const requestId = mock!.getLastRequestId();

    act(() => result.current.cancel());

    expect(mock!.reqDeletes.has(requestId)).toBe(true);
    expect(result.current.isCreating).toBe(false);
  });

  it('cancel() also deletes the response from ephemeral', () => {
    const { mock, result } = setup();
    const callbacks = { onProgress: vi.fn(), onDone: vi.fn(), onError: vi.fn() };

    act(() => result.current.createWorktree(DEFAULT_PARAMS, callbacks));
    const requestId = mock!.getLastRequestId();

    act(() => result.current.cancel());

    expect(mock!.respDeletes.has(requestId)).toBe(true);
  });

  it('cleans up on unmount', () => {
    const { mock, result, unmount } = setup();
    const callbacks = { onProgress: vi.fn(), onDone: vi.fn(), onError: vi.fn() };

    act(() => result.current.createWorktree(DEFAULT_PARAMS, callbacks));
    const requestId = mock!.getLastRequestId();

    unmount();

    expect(mock!.reqDeletes.has(requestId)).toBe(true);
    expect(mock!.respDeletes.has(requestId)).toBe(true);
  });

  it('times out after 120 seconds', () => {
    const { result } = setup();
    const callbacks = { onProgress: vi.fn(), onDone: vi.fn(), onError: vi.fn() };

    act(() => result.current.createWorktree(DEFAULT_PARAMS, callbacks));

    act(() => vi.advanceTimersByTime(120_000));

    expect(callbacks.onError).toHaveBeenCalledWith('Worktree creation timed out');
    expect(result.current.isCreating).toBe(false);
    expect(result.current.error).toBe('Worktree creation timed out');
  });

  it('calls onError when no roomHandle', () => {
    const { result } = setup({ handle: null });
    const callbacks = { onProgress: vi.fn(), onDone: vi.fn(), onError: vi.fn() };

    act(() => result.current.createWorktree(DEFAULT_PARAMS, callbacks));

    expect(callbacks.onError).toHaveBeenCalledWith('No connection or machine selected');
    expect(result.current.isCreating).toBe(false);
  });

  it('calls onError when no machineId', () => {
    const { result } = setup({ machineId: null });
    const callbacks = { onProgress: vi.fn(), onDone: vi.fn(), onError: vi.fn() };

    act(() => result.current.createWorktree(DEFAULT_PARAMS, callbacks));

    expect(callbacks.onError).toHaveBeenCalledWith('No connection or machine selected');
  });

  it('ignores responses for a different requestId', () => {
    const { mock, result } = setup();
    const callbacks = { onProgress: vi.fn(), onDone: vi.fn(), onError: vi.fn() };

    act(() => result.current.createWorktree(DEFAULT_PARAMS, callbacks));

    act(() =>
      mock!.emitResponse('wrong-id', {
        status: 'creating-worktree',
        detail: 'Nope',
        worktreePath: null,
        branchName: null,
        setupScriptStarted: null,
        warnings: null,
        error: null,
      })
    );

    expect(callbacks.onProgress).not.toHaveBeenCalled();
  });

  it('cleans up previous request when createWorktree() is called again', () => {
    const { mock, result } = setup();
    const cb1 = { onProgress: vi.fn(), onDone: vi.fn(), onError: vi.fn() };
    const cb2 = { onProgress: vi.fn(), onDone: vi.fn(), onError: vi.fn() };

    act(() => result.current.createWorktree(DEFAULT_PARAMS, cb1));
    const firstRequestId = mock!.getLastRequestId();

    act(() => result.current.createWorktree({ ...DEFAULT_PARAMS, branchName: 'feat/second' }, cb2));

    expect(mock!.reqDeletes.has(firstRequestId)).toBe(true);

    act(() =>
      mock!.emitResponse(firstRequestId, {
        status: 'creating-worktree',
        detail: 'Old',
        worktreePath: null,
        branchName: null,
        setupScriptStarted: null,
        warnings: null,
        error: null,
      })
    );
    expect(cb1.onProgress).not.toHaveBeenCalled();
    expect(cb2.onProgress).not.toHaveBeenCalled();
  });
});
