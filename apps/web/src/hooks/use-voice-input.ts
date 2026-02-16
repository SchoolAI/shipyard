import { useCallback, useEffect, useRef, useState } from 'react';

/** Web Speech API types — not included in TypeScript's DOM lib */
interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative | undefined;
}

interface SpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult | undefined;
}

interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
}

interface SpeechRecognitionInstance extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionInstance;
}

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

export function isSpeechRecognitionSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    (window.SpeechRecognition != null || window.webkitSpeechRecognition != null)
  );
}

interface UseVoiceInputOptions {
  lang?: string;
  onTranscript?: (text: string, isFinal: boolean) => void;
  onError?: (error: string) => void;
}

interface UseVoiceInputReturn {
  isListening: boolean;
  isSupported: boolean;
  interimText: string;
  start: () => void;
  stop: () => void;
  toggle: () => void;
}

const MAX_RESTARTS = 5;
const RESTART_WINDOW_MS = 10_000;

export function useVoiceInput({
  lang = 'en-US',
  onTranscript,
  onError,
}: UseVoiceInputOptions = {}): UseVoiceInputReturn {
  const [isListening, setIsListening] = useState(false);
  const [interimText, setInterimText] = useState('');

  const isListeningRef = useRef(false);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const onTranscriptRef = useRef(onTranscript);
  const onErrorRef = useRef(onError);
  onTranscriptRef.current = onTranscript;
  onErrorRef.current = onError;

  const restartTimestamps = useRef<number[]>([]);

  const [isSupported] = useState(() => isSpeechRecognitionSupported());

  const stop = useCallback(() => {
    isListeningRef.current = false;
    setIsListening(false);
    recognitionRef.current?.abort();
    recognitionRef.current = null;
  }, []);

  const start = useCallback(() => {
    if (!isSupported) {
      onErrorRef.current?.('Speech recognition is not supported in this browser');
      return;
    }
    if (isListeningRef.current) return;

    const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Ctor) return;

    const recognition = new Ctor();
    recognition.lang = lang;
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (!result?.[0]) continue;

        const text = result[0].transcript;
        if (result.isFinal) {
          onTranscriptRef.current?.(text, true);
        } else {
          interim += text;
          onTranscriptRef.current?.(text, false);
        }
      }
      setInterimText(interim);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      switch (event.error) {
        case 'no-speech':
        case 'aborted':
          return;
        case 'not-allowed':
          onErrorRef.current?.('Microphone permission denied');
          stop();
          return;
        case 'network':
          onErrorRef.current?.('Network error — speech recognition unavailable');
          stop();
          return;
        default:
          onErrorRef.current?.(event.error);
          stop();
      }
    };

    recognition.onend = () => {
      setInterimText('');
      if (!isListeningRef.current) return;

      const now = Date.now();
      const recent = restartTimestamps.current.filter((t) => now - t < RESTART_WINDOW_MS);
      if (recent.length >= MAX_RESTARTS) {
        onErrorRef.current?.('Speech recognition stopped — too many restarts');
        stop();
        return;
      }
      restartTimestamps.current = [...recent, now];

      try {
        recognition.start();
      } catch {
        stop();
      }
    };

    restartTimestamps.current = [];
    recognitionRef.current = recognition;
    isListeningRef.current = true;
    setIsListening(true);

    try {
      recognition.start();
    } catch {
      onErrorRef.current?.('Failed to start speech recognition');
      stop();
    }
  }, [isSupported, lang, stop]);

  const toggle = useCallback(() => {
    if (isListeningRef.current) {
      stop();
    } else {
      start();
    }
  }, [start, stop]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      recognitionRef.current = null;
      isListeningRef.current = false;
    };
  }, []);

  return { isListening, isSupported, interimText, start, stop, toggle };
}
