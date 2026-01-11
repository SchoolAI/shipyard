import { useCallback, useEffect, useRef, useState } from 'react';

interface UseWebcamReturn {
  stream: MediaStream | null;
  error: string | null;
  loading: boolean;
  startCamera: () => Promise<void>;
  stopCamera: () => void;
  videoRef: React.RefObject<HTMLVideoElement | null>;
}

function getErrorMessage(err: unknown): string {
  if (!(err instanceof Error)) {
    return 'Failed to access camera';
  }

  const { name, message } = err;

  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return 'Camera permission denied. Please allow camera access and try again.';
  }

  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'No camera found. Please connect a camera and try again.';
  }

  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return 'Camera is already in use by another application.';
  }

  return message;
}

export function useWebcam(): UseWebcamReturn {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const startCamera = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Check if getUserMedia is supported
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('getUserMedia is not supported in this browser');
      }

      // Request camera access
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false,
      });

      setStream(mediaStream);

      // Attach stream to video element
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (stream) {
      // Stop all tracks
      stream.getTracks().forEach((track) => {
        track.stop();
      });
      setStream(null);

      // Clear video element
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    }
  }, [stream]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => {
          track.stop();
        });
      }
    };
  }, [stream]);

  return {
    stream,
    error,
    loading,
    startCamera,
    stopCamera,
    videoRef,
  };
}
