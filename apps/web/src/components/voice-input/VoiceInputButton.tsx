import { Button, Tooltip } from '@heroui/react';
import { Loader2, Mic, MicOff } from 'lucide-react';
import { useCallback, useEffect } from 'react';
import { isSpeechError, useSpeechToText } from '@/hooks/useSpeechToText';

interface VoiceInputButtonProps {
  onTranscript: (text: string) => void;
  className?: string;
}

export function VoiceInputButton({ onTranscript, className }: VoiceInputButtonProps) {
  const speechResult = useSpeechToText();
  const { state, transcript, partialTranscript, startRecording, stopRecording, isSupported } =
    speechResult;

  useEffect(() => {
    if (transcript) {
      onTranscript(transcript);
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
        w-9 h-9
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
      <Tooltip>
        <Tooltip.Trigger>{button}</Tooltip.Trigger>
        <Tooltip.Content>{speechResult.error}</Tooltip.Content>
      </Tooltip>
    );
  }

  if (isRecording && partialTranscript) {
    return (
      <Tooltip>
        <Tooltip.Trigger>{button}</Tooltip.Trigger>
        <Tooltip.Content>{`"${partialTranscript}..."`}</Tooltip.Content>
      </Tooltip>
    );
  }

  return button;
}
