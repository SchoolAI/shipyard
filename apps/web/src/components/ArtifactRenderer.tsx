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

  if (!artifact.url) {
    return <ArtifactPlaceholder filename={artifact.filename} message="URL not available" />;
  }

  if (error) {
    return <ArtifactPlaceholder filename={artifact.filename} message="Failed to load" />;
  }

  switch (artifact.type) {
    case 'screenshot':
      return (
        <div className="relative">
          {loading && <LoadingSpinner />}
          {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: onLoad/onError are standard img events for loading states */}
          <img
            src={artifact.url}
            alt={artifact.filename}
            className="max-w-full rounded-lg border border-slate-200 dark:border-slate-700"
            onLoad={() => setLoading(false)}
            onError={() => {
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
          className="max-w-full rounded-lg border border-slate-200 dark:border-slate-700"
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
    <div className="p-4 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 text-center">
      <div className="text-slate-500 dark:text-slate-400 text-sm">{filename}</div>
      <div className="text-slate-400 dark:text-slate-500 text-xs mt-1">{message}</div>
    </div>
  );
}

function LoadingSpinner() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-slate-50 dark:bg-slate-800 rounded-lg">
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
      <div className="bg-slate-900 rounded-lg p-4 h-32 flex items-center justify-center">
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
    <div className="bg-slate-900 rounded-lg p-4 overflow-x-auto max-h-96">
      <div className="text-slate-400 text-xs mb-2">{filename}</div>
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
      <div className="bg-slate-900 rounded-lg p-4 h-32 flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  const lines = data.split('\n');

  return (
    <div className="bg-slate-900 rounded-lg p-4 overflow-x-auto max-h-96">
      <div className="text-slate-400 text-xs mb-2">{filename}</div>
      <pre className="text-sm font-mono">
        {lines.map((line, i) => {
          let className = 'text-slate-300';
          if (line.startsWith('+') && !line.startsWith('+++')) className = 'text-success-400';
          else if (line.startsWith('-') && !line.startsWith('---')) className = 'text-danger';
          else if (line.startsWith('@@')) className = 'text-primary';
          else if (line.startsWith('diff') || line.startsWith('index'))
            className = 'text-slate-500';

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
