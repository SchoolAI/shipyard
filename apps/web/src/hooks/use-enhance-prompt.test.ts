import type { PersonalRoomConnection, PersonalRoomServerMessage } from '@shipyard/session';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEnhancePrompt } from './use-enhance-prompt';

type MessageHandler = (msg: PersonalRoomServerMessage) => void;

function createMockConnection() {
  const handlers = new Set<MessageHandler>();
  const sendMock = vi.fn();
  return {
    sendMock,
    connection: {
      send: sendMock,
      onMessage: vi.fn((handler: MessageHandler) => {
        handlers.add(handler);
        return () => handlers.delete(handler);
      }),
    } as unknown as PersonalRoomConnection,
    handlers,
    emit(msg: PersonalRoomServerMessage) {
      for (const h of handlers) h(msg);
    },
  };
}

function getRequestId(sendMock: ReturnType<typeof vi.fn>): string {
  return (sendMock.mock.calls[0]![0] as Record<string, unknown>).requestId as string;
}

function setup(overrides: { machineId?: string | null } = {}) {
  const mock = createMockConnection();
  const hook = renderHook(() =>
    useEnhancePrompt({
      connection: mock.connection,
      machineId: overrides.machineId ?? 'machine-1',
    })
  );
  return { ...mock, ...hook };
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

  it('sends enhance-prompt-request on enhance()', () => {
    const { result, sendMock } = setup();
    const callbacks = { onChunk: vi.fn(), onDone: vi.fn(), onError: vi.fn() };

    act(() => result.current.enhance('write tests', callbacks));

    expect(sendMock).toHaveBeenCalledOnce();
    const sent = sendMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(sent.type).toBe('enhance-prompt-request');
    expect(sent.prompt).toBe('write tests');
    expect(sent.machineId).toBe('machine-1');
    expect(typeof sent.requestId).toBe('string');
  });

  it('sets isEnhancing to true while in-flight', () => {
    const { result } = setup();
    const callbacks = { onChunk: vi.fn(), onDone: vi.fn(), onError: vi.fn() };

    act(() => result.current.enhance('hello', callbacks));

    expect(result.current.isEnhancing).toBe(true);
  });

  it('calls onChunk with accumulated text', () => {
    const { result, sendMock, emit } = setup();
    const callbacks = { onChunk: vi.fn(), onDone: vi.fn(), onError: vi.fn() };

    act(() => result.current.enhance('hello', callbacks));

    const requestId = getRequestId(sendMock);

    act(() =>
      emit({ type: 'enhance-prompt-chunk', requestId: requestId as string, text: 'First ' })
    );
    expect(callbacks.onChunk).toHaveBeenCalledWith('First ');

    act(() =>
      emit({ type: 'enhance-prompt-chunk', requestId: requestId as string, text: 'Second' })
    );
    expect(callbacks.onChunk).toHaveBeenCalledWith('First Second');
  });

  it('calls onDone and resets state on enhance-prompt-done', () => {
    const { result, sendMock, emit } = setup();
    const callbacks = { onChunk: vi.fn(), onDone: vi.fn(), onError: vi.fn() };

    act(() => result.current.enhance('hello', callbacks));

    const requestId = getRequestId(sendMock);

    act(() =>
      emit({
        type: 'enhance-prompt-done',
        requestId: requestId as string,
        fullText: 'Enhanced hello',
      })
    );

    expect(callbacks.onDone).toHaveBeenCalledWith('Enhanced hello');
    expect(result.current.isEnhancing).toBe(false);
  });

  it('ignores messages for a different requestId', () => {
    const { result, emit } = setup();
    const callbacks = { onChunk: vi.fn(), onDone: vi.fn(), onError: vi.fn() };

    act(() => result.current.enhance('hello', callbacks));

    act(() => emit({ type: 'enhance-prompt-chunk', requestId: 'wrong-id', text: 'Nope' }));
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
    const { result, sendMock, emit } = setup();
    const callbacks = { onChunk: vi.fn(), onDone: vi.fn(), onError: vi.fn() };

    act(() => result.current.enhance('hello', callbacks));

    const requestId = getRequestId(sendMock);

    act(() => result.current.cancel());
    expect(result.current.isEnhancing).toBe(false);

    act(() => emit({ type: 'enhance-prompt-chunk', requestId: requestId as string, text: 'Late' }));
    expect(callbacks.onChunk).not.toHaveBeenCalled();
  });

  it('calls onError when no connection', () => {
    const { result } = renderHook(() =>
      useEnhancePrompt({ connection: null, machineId: 'machine-1' })
    );
    const callbacks = { onChunk: vi.fn(), onDone: vi.fn(), onError: vi.fn() };

    act(() => result.current.enhance('hello', callbacks));

    expect(callbacks.onError).toHaveBeenCalledWith('No connection or machine selected');
    expect(result.current.isEnhancing).toBe(false);
  });

  it('calls onError when no machineId', () => {
    const mock = createMockConnection();
    const { result } = renderHook(() =>
      useEnhancePrompt({ connection: mock.connection, machineId: null })
    );
    const callbacks = { onChunk: vi.fn(), onDone: vi.fn(), onError: vi.fn() };

    act(() => result.current.enhance('hello', callbacks));

    expect(callbacks.onError).toHaveBeenCalledWith('No connection or machine selected');
  });

  it('calls onError on daemon error message', () => {
    const { result, sendMock, emit } = setup();
    const callbacks = { onChunk: vi.fn(), onDone: vi.fn(), onError: vi.fn() };

    act(() => result.current.enhance('hello', callbacks));

    const requestId = getRequestId(sendMock);

    act(() =>
      emit({
        type: 'error',
        code: 'enhance_failed',
        message: 'Prompt enhancement failed',
        requestId,
      })
    );

    expect(callbacks.onError).toHaveBeenCalledWith('Prompt enhancement failed');
    expect(result.current.isEnhancing).toBe(false);
    expect(result.current.error).toBe('Prompt enhancement failed');
  });

  it('cleans up previous request when enhance() is called again', () => {
    const { result, sendMock, emit } = setup();
    const cb1 = { onChunk: vi.fn(), onDone: vi.fn(), onError: vi.fn() };
    const cb2 = { onChunk: vi.fn(), onDone: vi.fn(), onError: vi.fn() };

    act(() => result.current.enhance('first', cb1));
    const firstRequestId = getRequestId(sendMock);

    act(() => result.current.enhance('second', cb2));

    act(() =>
      emit({
        type: 'enhance-prompt-chunk',
        requestId: firstRequestId as string,
        text: 'Old',
      })
    );
    expect(cb1.onChunk).not.toHaveBeenCalled();
    expect(cb2.onChunk).not.toHaveBeenCalled();
  });
});
