import { useCallback, useEffect, useRef, useState } from 'react';

type SpeechState = 'idle' | 'loading' | 'ready' | 'recording' | 'error';

export interface UseSpeechToTextReturn {
  state: SpeechState;
  loadingProgress: number;
  transcript: string;
  partialTranscript: string;
  error: string | null;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  isSupported: boolean;
}

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

    setError(null);
    setTranscript('');
    setPartialTranscript('');
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

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setState('recording');
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const { finalText, interimText } = processRecognitionResults(event);
      if (finalText) {
        setTranscript((prev) => (prev ? `${prev} ${finalText}` : finalText));
        setPartialTranscript('');
      } else {
        setPartialTranscript(interimText);
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
      if (!isStoppingRef.current && stateRef.current === 'recording') {
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
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setState('ready');
  }, []);

  return {
    state,
    loadingProgress: isSupported ? 100 : 0,
    transcript,
    partialTranscript,
    error,
    startRecording,
    stopRecording,
    isSupported,
  };
}
