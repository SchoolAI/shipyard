import { useCallback, useEffect, useRef, useState } from 'react';

type UseSpeechToTextBase = {
  loadingProgress: number;
  transcript: string;
  partialTranscript: string;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  isSupported: boolean;
};

export type UseSpeechToTextReturn =
  | (UseSpeechToTextBase & { state: 'idle' | 'loading' | 'ready' | 'recording' })
  | (UseSpeechToTextBase & { state: 'error'; error: string });

export function isSpeechError(
  result: UseSpeechToTextReturn
): result is UseSpeechToTextBase & { state: 'error'; error: string } {
  return result.state === 'error';
}

type SpeechState = 'idle' | 'loading' | 'ready' | 'recording' | 'error';

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}

type SpeechRecognitionInstance = EventTarget & {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
};

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
  }
}

function getSpeechRecognition(): (new () => SpeechRecognitionInstance) | null {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function processRecognitionResults(event: SpeechRecognitionEvent): {
  finalText: string;
  interimText: string;
} {
  let finalText = '';
  let interimText = '';

  for (let i = event.resultIndex; i < event.results.length; i++) {
    const result = event.results[i];
    if (!result) continue;
    const firstAlternative = result[0];
    if (!firstAlternative) continue;
    if (result.isFinal) {
      finalText += firstAlternative.transcript;
    } else {
      interimText += firstAlternative.transcript;
    }
  }

  return { finalText, interimText };
}

export function useSpeechToText(): UseSpeechToTextReturn {
  const [state, setState] = useState<SpeechState>('idle');
  const [transcript, setTranscript] = useState('');
  const [partialTranscript, setPartialTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const isStoppingRef = useRef(false);
  const stateRef = useRef(state);
  // Track partial transcript in a ref so we can reliably read it when stopping
  // (avoids race conditions with nested setState calls)
  const partialTranscriptRef = useRef('');

  const SpeechRecognitionClass = getSpeechRecognition();
  const isSupported = SpeechRecognitionClass !== null;

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    if (!isSupported) {
      setState('error');
      setError('Speech recognition is not supported in this browser');
    } else {
      setState('ready');
    }
  }, [isSupported]);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
        recognitionRef.current = null;
      }
    };
  }, []);

  const startRecording = useCallback(async () => {
    if (!SpeechRecognitionClass) {
      setError('Speech recognition is not supported');
      setState('error');
      return;
    }

    // Prevent double-start
    if (stateRef.current === 'recording') {
      return;
    }

    // Clean up any existing recognition instance (iOS Safari silent failure fix)
    // Safari can silently fail if you don't fully destroy between sessions
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {
        // Ignore errors from aborting already-stopped recognition
      }
      recognitionRef.current = null;
    }

    setError(null);
    setTranscript('');
    setPartialTranscript('');
    partialTranscriptRef.current = '';
    isStoppingRef.current = false;

    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError('Microphone permission denied');
      setState('error');
      return;
    }

    const recognition = new SpeechRecognitionClass();
    recognitionRef.current = recognition;

    // Disable continuous on iOS Safari - it's buggy and causes never-ending recognition
    // Let onend handler restart if needed
    const isIOSSafari =
      /iPad|iPhone|iPod/.test(navigator.userAgent) && !/CriOS|FxiOS/.test(navigator.userAgent);
    recognition.continuous = !isIOSSafari;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setState('recording');
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const { finalText, interimText } = processRecognitionResults(event);
      if (finalText) {
        setTranscript((prev) => {
          const newTranscript = prev ? `${prev} ${finalText}` : finalText;
          return newTranscript;
        });
        setPartialTranscript('');
        partialTranscriptRef.current = '';
      } else {
        setPartialTranscript(interimText);
        partialTranscriptRef.current = interimText;
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === 'aborted' && isStoppingRef.current) {
        return;
      }

      const errorMessages: Record<string, string> = {
        'not-allowed': 'Microphone permission denied',
        'no-speech': 'No speech detected',
        network: 'Network error occurred',
        'audio-capture': 'No microphone found',
        aborted: 'Recording was stopped',
      };

      setError(errorMessages[event.error] || `Error: ${event.error}`);
      setState('error');
    };

    recognition.onend = () => {
      // Only auto-restart if we're still recording and not manually stopping
      // Also check if recognitionRef still exists (abort() sets it to null)
      if (!isStoppingRef.current && stateRef.current === 'recording' && recognitionRef.current) {
        recognition.start();
      } else {
        setState('ready');
        recognitionRef.current = null;
      }
    };

    try {
      recognition.start();
    } catch {
      setError('Failed to start speech recognition');
      setState('error');
    }
  }, [SpeechRecognitionClass]);

  const stopRecording = useCallback(() => {
    isStoppingRef.current = true;

    // On mobile Safari, isFinal may not be set until stop() is called
    // Capture any pending partial transcript as final text before stopping
    // Use ref to avoid race conditions with nested setState calls
    const pendingPartial = partialTranscriptRef.current;
    if (pendingPartial) {
      setTranscript((prev) => {
        const newTranscript = prev ? `${prev} ${pendingPartial}` : pendingPartial;
        return newTranscript;
      });
      setPartialTranscript('');
      partialTranscriptRef.current = '';
    }

    // Use stop() to allow finalization of results (abort() discards transcription)
    // The ding sound on iOS indicates recognition is properly stopping
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setState('ready');
  }, []);

  const base = {
    loadingProgress: isSupported ? 100 : 0,
    transcript,
    partialTranscript,
    startRecording,
    stopRecording,
    isSupported,
  };

  if (state === 'error') {
    return { ...base, state, error: error ?? 'Unknown error' };
  }

  return { ...base, state };
}
