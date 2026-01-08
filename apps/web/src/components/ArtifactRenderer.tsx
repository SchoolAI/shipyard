import type { Artifact, ArtifactType } from '@peer-plan/schema';
import { useEffect, useState } from 'react';

interface ArtifactRendererProps {
  artifact: Artifact;
}

/**
 * Renders an artifact based on its type.
 * Handles loading states and graceful fallback for missing artifacts.
 */
export function ArtifactRenderer({ artifact }: ArtifactRendererProps) {
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  // Reset state when artifact URL changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: Only reset when URL changes, not when entire artifact object changes
  useEffect(() => {
    setError(false);
    setLoading(true);
  }, [artifact.url]);

  // Timeout fallback: clear loading spinner after 5 seconds to prevent infinite loading
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (loading) {
        // biome-ignore lint/suspicious/noConsole: Debug logging for timeout troubleshooting
        console.warn(`[ArtifactRenderer] Timeout loading ${artifact.filename}, clearing spinner`);
        setLoading(false);
      }
    }, 5000);
    return () => clearTimeout(timeout);
  }, [artifact.filename, loading]);

  if (!artifact.url) {
    return <ArtifactPlaceholder filename={artifact.filename} message="URL not available" />;
  }

  if (error) {
    return <ArtifactPlaceholder filename={artifact.filename} message="Failed to load" />;
  }

  switch (artifact.type) {
    case 'screenshot':
      return (
        <div className="relative min-h-[200px]">
          {loading && <LoadingSpinner />}
          {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: onLoad/onError are standard img events for loading states */}
          <img
            src={artifact.url}
            alt={artifact.filename}
            className={`max-w-full rounded-lg border border-separator transition-opacity duration-200 ${loading ? 'opacity-0' : 'opacity-100'}`}
            onLoad={() => {
              // biome-ignore lint/suspicious/noConsole: Debug logging for load events
              console.log(`[ArtifactRenderer] Image loaded: ${artifact.filename}`);
              setLoading(false);
            }}
            onError={(e) => {
              // biome-ignore lint/suspicious/noConsole: Debug logging for load errors
              console.error(`[ArtifactRenderer] Image error: ${artifact.filename}`, e);
              setLoading(false);
              setError(true);
            }}
          />
        </div>
      );

    case 'video':
      return (
        <video
          src={artifact.url}
          controls
          className="max-w-full rounded-lg border border-separator"
          onError={() => setError(true)}
        >
          <track kind="captions" />
          Your browser does not support video playback.
        </video>
      );

    case 'test_results':
      return (
        <JsonViewer
          url={artifact.url}
          filename={artifact.filename}
          onError={() => setError(true)}
        />
      );

    case 'diff':
      return (
        <DiffViewer
          url={artifact.url}
          filename={artifact.filename}
          onError={() => setError(true)}
        />
      );

    default: {
      const _exhaustive: never = artifact.type;
      return (
        <ArtifactPlaceholder
          filename={artifact.filename}
          message={`Unknown type: ${_exhaustive as ArtifactType}`}
        />
      );
    }
  }
}

function ArtifactPlaceholder({ filename, message }: { filename: string; message: string }) {
  return (
    <div className="p-4 bg-muted rounded-lg border border-separator text-center">
      <div className="text-muted-foreground text-sm">{filename}</div>
      <div className="text-muted-foreground text-xs mt-1">{message}</div>
    </div>
  );
}

function LoadingSpinner() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-muted/50 rounded-lg">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>
  );
}

interface TextViewerProps {
  url: string;
  filename: string;
  onError: () => void;
}

function JsonViewer({ url, filename, onError }: TextViewerProps) {
  const [data, setData] = useState<string | null>(null);

  useEffect(() => {
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then((text) => setData(text))
      .catch(() => onError());
  }, [url, onError]);

  if (!data) {
    return (
      <div className="relative bg-surface rounded-lg p-4 min-h-[200px]">
        <LoadingSpinner />
      </div>
    );
  }

  // Try to pretty-print JSON
  let displayContent = data;
  try {
    const parsed = JSON.parse(data);
    displayContent = JSON.stringify(parsed, null, 2);
  } catch {
    // Not valid JSON, show as-is
  }

  return (
    <div className="bg-muted rounded-lg p-4 overflow-x-auto max-h-96">
      <div className="text-muted-foreground text-xs mb-2">{filename}</div>
      <pre className="text-success-400 text-sm font-mono whitespace-pre-wrap">{displayContent}</pre>
    </div>
  );
}

function DiffViewer({ url, filename, onError }: TextViewerProps) {
  const [data, setData] = useState<string | null>(null);

  useEffect(() => {
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then((text) => setData(text))
      .catch(() => onError());
  }, [url, onError]);

  if (!data) {
    return (
      <div className="relative bg-surface rounded-lg p-4 min-h-[200px]">
        <LoadingSpinner />
      </div>
    );
  }

  const lines = data.split('\n');

  return (
    <div className="bg-muted rounded-lg p-4 overflow-x-auto max-h-96">
      <div className="text-muted-foreground text-xs mb-2">{filename}</div>
      <pre className="text-sm font-mono">
        {lines.map((line, i) => {
          let className = 'text-foreground';
          if (line.startsWith('+') && !line.startsWith('+++')) className = 'text-success-400';
          else if (line.startsWith('-') && !line.startsWith('---')) className = 'text-danger';
          else if (line.startsWith('@@')) className = 'text-primary';
          else if (line.startsWith('diff') || line.startsWith('index'))
            className = 'text-muted-foreground';

          return (
            <div key={`${i}-${line.slice(0, 20)}`} className={className}>
              {line}
            </div>
          );
        })}
      </pre>
    </div>
  );
}
