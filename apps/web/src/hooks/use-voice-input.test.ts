import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isSpeechRecognitionSupported, useVoiceInput } from './use-voice-input';

function createMockSpeechRecognition() {
  const instance = {
    lang: '',
    continuous: false,
    interimResults: false,
    onresult: null as ((event: unknown) => void) | null,
    onerror: null as ((event: unknown) => void) | null,
    onend: null as (() => void) | null,
    start: vi.fn(),
    stop: vi.fn(),
    abort: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(() => true),
  };

  /* vi.fn with a function (not arrow) so it can be called with `new` */
  const Ctor = vi.fn(function SpeechRecognition() {
    return instance;
  });

  return { Ctor, instance };
}

function createMockResultEvent(transcript: string, isFinal: boolean, resultIndex = 0) {
  const result = {
    isFinal,
    length: 1,
    0: { transcript, confidence: 0.95 },
    item: () => ({ transcript, confidence: 0.95 }),
  };
  return {
    resultIndex,
    results: {
      length: resultIndex + 1,
      [resultIndex]: result,
      item: (i: number) => (i === resultIndex ? result : undefined),
    },
  };
}

let savedSpeechRecognition: unknown;
let savedWebkitSpeechRecognition: unknown;

beforeEach(() => {
  savedSpeechRecognition = window.SpeechRecognition;
  savedWebkitSpeechRecognition = window.webkitSpeechRecognition;
});

afterEach(() => {
  window.SpeechRecognition = savedSpeechRecognition as typeof window.SpeechRecognition;
  window.webkitSpeechRecognition =
    savedWebkitSpeechRecognition as typeof window.webkitSpeechRecognition;
});

describe('isSpeechRecognitionSupported', () => {
  it('returns true when window.SpeechRecognition exists', () => {
    const { Ctor } = createMockSpeechRecognition();
    window.SpeechRecognition = Ctor as unknown as typeof window.SpeechRecognition;
    window.webkitSpeechRecognition = undefined;
    expect(isSpeechRecognitionSupported()).toBe(true);
  });

  it('returns true when window.webkitSpeechRecognition exists', () => {
    window.SpeechRecognition = undefined;
    const { Ctor } = createMockSpeechRecognition();
    window.webkitSpeechRecognition = Ctor as unknown as typeof window.webkitSpeechRecognition;
    expect(isSpeechRecognitionSupported()).toBe(true);
  });

  it('returns false when neither exists', () => {
    window.SpeechRecognition = undefined;
    window.webkitSpeechRecognition = undefined;
    expect(isSpeechRecognitionSupported()).toBe(false);
  });
});

describe('useVoiceInput', () => {
  describe('initialization', () => {
    it('returns isSupported true when API is available', () => {
      const { Ctor } = createMockSpeechRecognition();
      window.SpeechRecognition = Ctor as unknown as typeof window.SpeechRecognition;

      const { result } = renderHook(() => useVoiceInput());
      expect(result.current.isSupported).toBe(true);
    });

    it('returns isSupported false when API is unavailable', () => {
      window.SpeechRecognition = undefined;
      window.webkitSpeechRecognition = undefined;

      const { result } = renderHook(() => useVoiceInput());
      expect(result.current.isSupported).toBe(false);
    });

    it('starts with isListening false and empty interimText', () => {
      const { Ctor } = createMockSpeechRecognition();
      window.SpeechRecognition = Ctor as unknown as typeof window.SpeechRecognition;

      const { result } = renderHook(() => useVoiceInput());
      expect(result.current.isListening).toBe(false);
      expect(result.current.interimText).toBe('');
    });
  });

  describe('start/stop lifecycle', () => {
    it('start() creates a recognition instance and calls recognition.start()', () => {
      const { Ctor, instance } = createMockSpeechRecognition();
      window.SpeechRecognition = Ctor as unknown as typeof window.SpeechRecognition;

      const { result } = renderHook(() => useVoiceInput());
      act(() => result.current.start());

      expect(Ctor).toHaveBeenCalledOnce();
      expect(instance.start).toHaveBeenCalledOnce();
    });

    it('start() sets isListening to true', () => {
      const { Ctor } = createMockSpeechRecognition();
      window.SpeechRecognition = Ctor as unknown as typeof window.SpeechRecognition;

      const { result } = renderHook(() => useVoiceInput());
      act(() => result.current.start());

      expect(result.current.isListening).toBe(true);
    });

    it('stop() calls recognition.abort() and sets isListening to false', () => {
      const { Ctor, instance } = createMockSpeechRecognition();
      window.SpeechRecognition = Ctor as unknown as typeof window.SpeechRecognition;

      const { result } = renderHook(() => useVoiceInput());
      act(() => result.current.start());
      act(() => result.current.stop());

      expect(instance.abort).toHaveBeenCalled();
      expect(result.current.isListening).toBe(false);
    });

    it('toggle() starts when idle and stops when listening', () => {
      const { Ctor, instance } = createMockSpeechRecognition();
      window.SpeechRecognition = Ctor as unknown as typeof window.SpeechRecognition;

      const { result } = renderHook(() => useVoiceInput());

      act(() => result.current.toggle());
      expect(result.current.isListening).toBe(true);

      act(() => result.current.toggle());
      expect(instance.abort).toHaveBeenCalled();
      expect(result.current.isListening).toBe(false);
    });

    it('start() is a no-op when already listening', () => {
      const { Ctor } = createMockSpeechRecognition();
      window.SpeechRecognition = Ctor as unknown as typeof window.SpeechRecognition;

      const { result } = renderHook(() => useVoiceInput());
      act(() => result.current.start());
      act(() => result.current.start());

      expect(Ctor).toHaveBeenCalledOnce();
    });

    it('start() calls onError when isSupported is false', () => {
      window.SpeechRecognition = undefined;
      window.webkitSpeechRecognition = undefined;

      const onError = vi.fn();
      const { result } = renderHook(() => useVoiceInput({ onError }));
      act(() => result.current.start());

      expect(result.current.isListening).toBe(false);
      expect(onError).toHaveBeenCalledWith('Speech recognition is not supported in this browser');
    });
  });

  describe('transcript handling', () => {
    it('fires onTranscript with (text, true) for final results', () => {
      const { Ctor, instance } = createMockSpeechRecognition();
      window.SpeechRecognition = Ctor as unknown as typeof window.SpeechRecognition;

      const onTranscript = vi.fn();
      const { result } = renderHook(() => useVoiceInput({ onTranscript }));
      act(() => result.current.start());

      act(() => {
        instance.onresult?.(createMockResultEvent('done', true));
      });
      expect(onTranscript).toHaveBeenCalledWith('done', true);
    });

    it('fires onTranscript with (text, false) for interim results', () => {
      const { Ctor, instance } = createMockSpeechRecognition();
      window.SpeechRecognition = Ctor as unknown as typeof window.SpeechRecognition;

      const onTranscript = vi.fn();
      const { result } = renderHook(() => useVoiceInput({ onTranscript }));
      act(() => result.current.start());

      act(() => {
        instance.onresult?.(createMockResultEvent('partial', false));
      });
      expect(onTranscript).toHaveBeenCalledWith('partial', false);
    });

    it('interim results update interimText', () => {
      const { Ctor, instance } = createMockSpeechRecognition();
      window.SpeechRecognition = Ctor as unknown as typeof window.SpeechRecognition;

      const { result } = renderHook(() => useVoiceInput());
      act(() => result.current.start());

      act(() => {
        instance.onresult?.(createMockResultEvent('hel', false));
      });
      expect(result.current.interimText).toBe('hel');
    });
  });

  describe('error handling', () => {
    it('not-allowed error stops listening and calls onError with permission message', () => {
      const { Ctor, instance } = createMockSpeechRecognition();
      window.SpeechRecognition = Ctor as unknown as typeof window.SpeechRecognition;

      const onError = vi.fn();
      const { result } = renderHook(() => useVoiceInput({ onError }));
      act(() => result.current.start());

      act(() => {
        instance.onerror?.({ error: 'not-allowed' });
      });
      expect(onError).toHaveBeenCalledWith('Microphone permission denied');
      expect(result.current.isListening).toBe(false);
    });

    it('network error stops listening and calls onError with network message', () => {
      const { Ctor, instance } = createMockSpeechRecognition();
      window.SpeechRecognition = Ctor as unknown as typeof window.SpeechRecognition;

      const onError = vi.fn();
      const { result } = renderHook(() => useVoiceInput({ onError }));
      act(() => result.current.start());

      act(() => {
        instance.onerror?.({ error: 'network' });
      });
      expect(onError).toHaveBeenCalledWith('Network error \u2014 speech recognition unavailable');
      expect(result.current.isListening).toBe(false);
    });

    it('no-speech error is silently ignored', () => {
      const { Ctor, instance } = createMockSpeechRecognition();
      window.SpeechRecognition = Ctor as unknown as typeof window.SpeechRecognition;

      const onError = vi.fn();
      const { result } = renderHook(() => useVoiceInput({ onError }));
      act(() => result.current.start());

      act(() => {
        instance.onerror?.({ error: 'no-speech' });
      });
      expect(onError).not.toHaveBeenCalled();
      expect(result.current.isListening).toBe(true);
    });

    it('aborted error is silently ignored', () => {
      const { Ctor, instance } = createMockSpeechRecognition();
      window.SpeechRecognition = Ctor as unknown as typeof window.SpeechRecognition;

      const onError = vi.fn();
      const { result } = renderHook(() => useVoiceInput({ onError }));
      act(() => result.current.start());

      act(() => {
        instance.onerror?.({ error: 'aborted' });
      });
      expect(onError).not.toHaveBeenCalled();
      expect(result.current.isListening).toBe(true);
    });
  });

  describe('cleanup', () => {
    it('unmounting calls abort() on the recognition instance', () => {
      const { Ctor, instance } = createMockSpeechRecognition();
      window.SpeechRecognition = Ctor as unknown as typeof window.SpeechRecognition;

      const { result, unmount } = renderHook(() => useVoiceInput());
      act(() => result.current.start());

      unmount();
      expect(instance.abort).toHaveBeenCalled();
    });
  });

  describe('auto-restart', () => {
    it('restarts recognition when onend fires while still listening', () => {
      const { Ctor, instance } = createMockSpeechRecognition();
      window.SpeechRecognition = Ctor as unknown as typeof window.SpeechRecognition;

      const { result } = renderHook(() => useVoiceInput());
      act(() => result.current.start());

      expect(instance.start).toHaveBeenCalledOnce();

      act(() => {
        instance.onend?.();
      });

      expect(instance.start).toHaveBeenCalledTimes(2);
      expect(result.current.isListening).toBe(true);
    });

    it('does not restart when onend fires after stop()', () => {
      const { Ctor, instance } = createMockSpeechRecognition();
      window.SpeechRecognition = Ctor as unknown as typeof window.SpeechRecognition;

      const { result } = renderHook(() => useVoiceInput());
      act(() => result.current.start());
      act(() => result.current.stop());

      instance.start.mockClear();

      act(() => {
        instance.onend?.();
      });

      expect(instance.start).not.toHaveBeenCalled();
    });

    it('stops after too many restarts within the time window', () => {
      const { Ctor, instance } = createMockSpeechRecognition();
      window.SpeechRecognition = Ctor as unknown as typeof window.SpeechRecognition;

      const onError = vi.fn();
      const { result } = renderHook(() => useVoiceInput({ onError }));
      act(() => result.current.start());

      for (let i = 0; i < 6; i++) {
        act(() => {
          instance.onend?.();
        });
      }

      expect(result.current.isListening).toBe(false);
      expect(onError).toHaveBeenCalledWith('Speech recognition stopped — too many restarts');
    });
  });
});
