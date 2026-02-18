import type {
  EnhancePromptRequestEphemeralValue,
  EnhancePromptResponseEphemeralValue,
} from '@shipyard/loro-schema';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEnhancePrompt } from './use-enhance-prompt';
import type { RoomHandle } from './use-room-handle';

type EphemeralSubscribeCb = (event: {
  key: string;
  value: EnhancePromptResponseEphemeralValue | undefined;
  source: 'local' | 'remote' | 'initial';
}) => void;

function createMockRoomHandle() {
  const reqSets = new Map<string, EnhancePromptRequestEphemeralValue>();
  const reqDeletes = new Set<string>();
  const respDeletes = new Set<string>();
  const respSubscribers = new Set<EphemeralSubscribeCb>();

  const handle = {
    enhancePromptReqs: {
      set: vi.fn((key: string, value: EnhancePromptRequestEphemeralValue) => {
        reqSets.set(key, value);
      }),
      delete: vi.fn((key: string) => {
        reqDeletes.add(key);
      }),
    },
    enhancePromptResps: {
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
    /** Simulate a remote ephemeral response arriving. */
    emitResponse(key: string, value: EnhancePromptResponseEphemeralValue) {
      for (const cb of respSubscribers) {
        cb({ key, value, source: 'remote' });
      }
    },
    /** Simulate a local echo (should be ignored by the hook). */
    emitLocalEcho(key: string, value: EnhancePromptResponseEphemeralValue) {
      for (const cb of respSubscribers) {
        cb({ key, value, source: 'local' });
      }
    },
    /** Get the requestId from the most recent set call. */
    getLastRequestId(): string {
      const calls = (handle.enhancePromptReqs.set as ReturnType<typeof vi.fn>).mock.calls;
      const last = calls[calls.length - 1];
      return last ? (last[0] as string) : '';
    },
  };
}

function setup(overrides: { machineId?: string | null; handle?: RoomHandle | null } = {}) {
  const mock = overrides.handle !== undefined ? null : createMockRoomHandle();
  const roomHandle = overrides.handle !== undefined ? overrides.handle : mock!.handle;
  const machineId = 'machineId' in overrides ? (overrides.machineId ?? null) : 'machine-1';
  const hook = renderHook(() =>
    useEnhancePrompt({
      roomHandle,
      machineId,
    })
  );
  return { mock, ...hook };
}

describe('useEnhancePrompt', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts idle', () => {
    const { result } = setup();
    expect(result.current.isEnhancing).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('writes request to enhancePromptReqs ephemeral on enhance()', () => {
    const { mock, result } = setup();
    const callbacks = { onChunk: vi.fn(), onDone: vi.fn(), onError: vi.fn() };

    act(() => result.current.enhance('write tests', callbacks));

    expect(mock!.handle.enhancePromptReqs.set).toHaveBeenCalledOnce();
    const [key, value] = (mock!.handle.enhancePromptReqs.set as ReturnType<typeof vi.fn>).mock
      .calls[0]!;
    expect(typeof key).toBe('string');
    expect(value).toMatchObject({
      machineId: 'machine-1',
      prompt: 'write tests',
    });
    expect(typeof value.requestedAt).toBe('number');
  });

  it('sets isEnhancing to true while in-flight', () => {
    const { result } = setup();
    const callbacks = { onChunk: vi.fn(), onDone: vi.fn(), onError: vi.fn() };

    act(() => result.current.enhance('hello', callbacks));

    expect(result.current.isEnhancing).toBe(true);
  });

  it('calls onChunk when streaming response arrives', () => {
    const { mock, result } = setup();
    const callbacks = { onChunk: vi.fn(), onDone: vi.fn(), onError: vi.fn() };

    act(() => result.current.enhance('hello', callbacks));
    const requestId = mock!.getLastRequestId();

    act(() =>
      mock!.emitResponse(requestId, {
        status: 'streaming',
        text: 'First chunk',
        error: null,
      })
    );
    expect(callbacks.onChunk).toHaveBeenCalledWith('First chunk');

    act(() =>
      mock!.emitResponse(requestId, {
        status: 'streaming',
        text: 'First chunk more text',
        error: null,
      })
    );
    expect(callbacks.onChunk).toHaveBeenCalledWith('First chunk more text');
  });

  it('calls onDone and resets state on done response', () => {
    const { mock, result } = setup();
    const callbacks = { onChunk: vi.fn(), onDone: vi.fn(), onError: vi.fn() };

    act(() => result.current.enhance('hello', callbacks));
    const requestId = mock!.getLastRequestId();

    act(() =>
      mock!.emitResponse(requestId, {
        status: 'done',
        text: 'Enhanced hello',
        error: null,
      })
    );

    expect(callbacks.onDone).toHaveBeenCalledWith('Enhanced hello');
    expect(result.current.isEnhancing).toBe(false);
  });

  it('ignores responses for a different requestId', () => {
    const { mock, result } = setup();
    const callbacks = { onChunk: vi.fn(), onDone: vi.fn(), onError: vi.fn() };

    act(() => result.current.enhance('hello', callbacks));

    act(() =>
      mock!.emitResponse('wrong-id', {
        status: 'streaming',
        text: 'Nope',
        error: null,
      })
    );
    expect(callbacks.onChunk).not.toHaveBeenCalled();
  });

  it('ignores local echo (source === "local")', () => {
    const { mock, result } = setup();
    const callbacks = { onChunk: vi.fn(), onDone: vi.fn(), onError: vi.fn() };

    act(() => result.current.enhance('hello', callbacks));
    const requestId = mock!.getLastRequestId();

    act(() =>
      mock!.emitLocalEcho(requestId, {
        status: 'streaming',
        text: 'Local echo',
        error: null,
      })
    );
    expect(callbacks.onChunk).not.toHaveBeenCalled();
  });

  it('times out after 30 seconds', () => {
    const { result } = setup();
    const callbacks = { onChunk: vi.fn(), onDone: vi.fn(), onError: vi.fn() };

    act(() => result.current.enhance('hello', callbacks));

    act(() => vi.advanceTimersByTime(30_000));

    expect(callbacks.onError).toHaveBeenCalledWith('Enhancement timed out');
    expect(result.current.isEnhancing).toBe(false);
    expect(result.current.error).toBe('Enhancement timed out');
  });

  it('cancel() stops in-flight enhancement', () => {
    const { mock, result } = setup();
    const callbacks = { onChunk: vi.fn(), onDone: vi.fn(), onError: vi.fn() };

    act(() => result.current.enhance('hello', callbacks));
    const requestId = mock!.getLastRequestId();

    act(() => result.current.cancel());
    expect(result.current.isEnhancing).toBe(false);

    act(() =>
      mock!.emitResponse(requestId, {
        status: 'streaming',
        text: 'Late',
        error: null,
      })
    );
    expect(callbacks.onChunk).not.toHaveBeenCalled();
  });

  it('cancel() deletes the request from ephemeral', () => {
    const { mock, result } = setup();
    const callbacks = { onChunk: vi.fn(), onDone: vi.fn(), onError: vi.fn() };

    act(() => result.current.enhance('hello', callbacks));
    const requestId = mock!.getLastRequestId();

    act(() => result.current.cancel());
    expect(mock!.reqDeletes.has(requestId)).toBe(true);
  });

  it('calls onError when no roomHandle', () => {
    const { result } = setup({ handle: null });
    const callbacks = { onChunk: vi.fn(), onDone: vi.fn(), onError: vi.fn() };

    act(() => result.current.enhance('hello', callbacks));

    expect(callbacks.onError).toHaveBeenCalledWith('No connection or machine selected');
    expect(result.current.isEnhancing).toBe(false);
  });

  it('calls onError when no machineId', () => {
    const { result } = setup({ machineId: null });
    const callbacks = { onChunk: vi.fn(), onDone: vi.fn(), onError: vi.fn() };

    act(() => result.current.enhance('hello', callbacks));

    expect(callbacks.onError).toHaveBeenCalledWith('No connection or machine selected');
  });

  it('calls onError on daemon error response', () => {
    const { mock, result } = setup();
    const callbacks = { onChunk: vi.fn(), onDone: vi.fn(), onError: vi.fn() };

    act(() => result.current.enhance('hello', callbacks));
    const requestId = mock!.getLastRequestId();

    act(() =>
      mock!.emitResponse(requestId, {
        status: 'error',
        text: '',
        error: 'Prompt enhancement failed',
      })
    );

    expect(callbacks.onError).toHaveBeenCalledWith('Prompt enhancement failed');
    expect(result.current.isEnhancing).toBe(false);
    expect(result.current.error).toBe('Prompt enhancement failed');
  });

  it('cleans up previous request when enhance() is called again', () => {
    const { mock, result } = setup();
    const cb1 = { onChunk: vi.fn(), onDone: vi.fn(), onError: vi.fn() };
    const cb2 = { onChunk: vi.fn(), onDone: vi.fn(), onError: vi.fn() };

    act(() => result.current.enhance('first', cb1));
    const firstRequestId = mock!.getLastRequestId();

    act(() => result.current.enhance('second', cb2));

    // Old request should be deleted
    expect(mock!.reqDeletes.has(firstRequestId)).toBe(true);

    // Response on old requestId should be ignored
    act(() =>
      mock!.emitResponse(firstRequestId, {
        status: 'streaming',
        text: 'Old',
        error: null,
      })
    );
    expect(cb1.onChunk).not.toHaveBeenCalled();
    expect(cb2.onChunk).not.toHaveBeenCalled();
  });
});
