import { Button } from '@heroui/react';
import { useWebcam } from '../hooks/useWebcam';

export function WebcamViewer() {
  const { stream, error, loading, startCamera, stopCamera, videoRef } = useWebcam();

  return (
    <div className="w-full max-w-2xl rounded-lg border border-gray-700 bg-gray-900 shadow-lg overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-gray-700">
        <h2 className="text-2xl font-bold text-white">Webcam Viewer</h2>
        <p className="text-sm text-gray-400">View your local camera feed</p>
      </div>

      {/* Body */}
      <div className="relative aspect-video bg-black">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <div className="text-center">
              <p className="text-red-500 mb-2 font-semibold">Error</p>
              <p className="text-sm text-gray-400">{error}</p>
            </div>
          </div>
        )}

        {stream && (
          <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
        )}

        {!stream && !loading && !error && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-gray-400">Click "Start Camera" to begin</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-gray-700 flex gap-2 justify-end">
        {!stream ? (
          <Button onPress={startCamera} isDisabled={loading}>
            {loading ? 'Starting...' : 'Start Camera'}
          </Button>
        ) : (
          <Button onPress={stopCamera}>Stop Camera</Button>
        )}
      </div>
    </div>
  );
}
