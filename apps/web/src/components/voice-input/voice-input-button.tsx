import { Button, Tooltip } from '@heroui/react';
import { Loader2, Mic, MicOff } from 'lucide-react';
import { useCallback, useEffect, useRef } from 'react';
import { isSpeechError, useSpeechToText } from '@/hooks/use-speech-to-text';

interface VoiceInputButtonProps {
  onTranscript: (text: string) => void;
  className?: string;
}

export function VoiceInputButton({ onTranscript, className }: VoiceInputButtonProps) {
  const speechResult = useSpeechToText();
  const { state, transcript, partialTranscript, startRecording, stopRecording, isSupported } =
    speechResult;

  /*
   * Track the last transcript length we've already sent to avoid duplicates
   * The transcript is cumulative (e.g., "hello" then "hello world"), so we only
   * want to send the NEW portion ("world") to avoid duplication in the text field
   */
  const lastSentLengthRef = useRef(0);

  /** Reset tracking when recording starts fresh (transcript becomes empty) */
  useEffect(() => {
    if (!transcript) {
      lastSentLengthRef.current = 0;
    }
  }, [transcript]);

  useEffect(() => {
    if (transcript && transcript.length > lastSentLengthRef.current) {
      /** Only send the NEW portion of the transcript */
      const newText = transcript.slice(lastSentLengthRef.current).trim();
      if (newText) {
        onTranscript(newText);
      }
      lastSentLengthRef.current = transcript.length;
    }
  }, [transcript, onTranscript]);

  const handlePress = useCallback(() => {
    if (state === 'recording') {
      stopRecording();
    } else if (state === 'ready' || state === 'idle') {
      startRecording();
    }
  }, [state, startRecording, stopRecording]);

  if (!isSupported) {
    return null;
  }

  const isRecording = state === 'recording';
  const isLoading = state === 'loading';
  const hasError = isSpeechError(speechResult);

  const getIcon = () => {
    if (isLoading) {
      return <Loader2 className="w-4 h-4 animate-spin" />;
    }
    if (hasError) {
      return <MicOff className="w-4 h-4" />;
    }
    return <Mic className="w-4 h-4" />;
  };

  const getAriaLabel = () => {
    if (isLoading) return 'Loading speech recognition...';
    if (hasError) return speechResult.error;
    if (isRecording) return 'Stop recording';
    return 'Start voice input';
  };

  const button = (
    <Button
      isIconOnly
      size="sm"
      variant={isRecording ? 'danger' : 'ghost'}
      onPress={handlePress}
      isDisabled={isLoading}
      aria-label={getAriaLabel()}
      className={`
        min-w-[44px] min-h-[44px]
        ${isRecording ? 'voice-recording' : ''}
        ${hasError ? 'text-danger' : ''}
        ${className || ''}
      `.trim()}
    >
      {getIcon()}
    </Button>
  );

  if (hasError) {
    return (
      <Tooltip delay={0}>
        <Tooltip.Trigger>{button}</Tooltip.Trigger>
        <Tooltip.Content>{speechResult.error}</Tooltip.Content>
      </Tooltip>
    );
  }

  if (isRecording) {
    return (
      <Tooltip delay={0}>
        <Tooltip.Trigger>{button}</Tooltip.Trigger>
        <Tooltip.Content>
          <div className="text-center max-w-xs">
            {partialTranscript ? (
              <p className="mb-1 font-medium">"{partialTranscript}..."</p>
            ) : (
              <p className="mb-1 text-foreground-400 italic">Listening...</p>
            )}
            <p className="text-xs opacity-70">Tap mic to stop</p>
          </div>
        </Tooltip.Content>
      </Tooltip>
    );
  }

  return button;
}
