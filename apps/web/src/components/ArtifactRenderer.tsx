import { Button, Card } from '@heroui/react';
import type { Artifact, ArtifactType } from '@peer-plan/schema';
import { useCallback, useEffect, useState } from 'react';
import { useGitHubAuth } from '../hooks/useGitHubAuth';
import { type FetchArtifactStatus, fetchArtifact } from '../utils/github-artifact-fetcher';

interface ArtifactRendererProps {
  artifact: Artifact;
}

/**
 * Renders an artifact based on its type with GitHub authentication support.
 * Handles private repo artifacts by prompting for GitHub sign-in when needed.
 */
export function ArtifactRenderer({ artifact }: ArtifactRendererProps) {
  const { identity, hasRepoScope, startAuth, requestRepoAccess } = useGitHubAuth();
  const token = identity?.token ?? null;
  const isSignedIn = identity !== null;

  if (!artifact.url) {
    return <ArtifactPlaceholder filename={artifact.filename} message="URL not available" />;
  }

  switch (artifact.type) {
    case 'screenshot':
      return (
        <BinaryArtifactViewer
          url={artifact.url}
          filename={artifact.filename}
          token={token}
          isSignedIn={isSignedIn}
          hasRepoScope={hasRepoScope}
          onSignIn={startAuth}
          onRequestRepoAccess={requestRepoAccess}
          renderContent={(blobUrl) => (
            <img
              src={blobUrl}
              alt={artifact.filename}
              className="max-w-full rounded-lg border border-separator"
            />
          )}
        />
      );

    case 'video':
      return (
        <BinaryArtifactViewer
          url={artifact.url}
          filename={artifact.filename}
          token={token}
          isSignedIn={isSignedIn}
          hasRepoScope={hasRepoScope}
          onSignIn={startAuth}
          onRequestRepoAccess={requestRepoAccess}
          renderContent={(blobUrl) => (
            <video src={blobUrl} controls className="max-w-full rounded-lg border border-separator">
              <track kind="captions" />
              Your browser does not support video playback.
            </video>
          )}
        />
      );

    case 'test_results':
      return (
        <TextArtifactViewer
          url={artifact.url}
          filename={artifact.filename}
          token={token}
          isSignedIn={isSignedIn}
          hasRepoScope={hasRepoScope}
          onSignIn={startAuth}
          onRequestRepoAccess={requestRepoAccess}
          renderContent={(content) => (
            <JsonContent content={content} filename={artifact.filename} />
          )}
        />
      );

    case 'diff':
      return (
        <TextArtifactViewer
          url={artifact.url}
          filename={artifact.filename}
          token={token}
          isSignedIn={isSignedIn}
          hasRepoScope={hasRepoScope}
          onSignIn={startAuth}
          onRequestRepoAccess={requestRepoAccess}
          renderContent={(content) => (
            <DiffContent content={content} filename={artifact.filename} />
          )}
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

// ============================================================================
// Binary Artifact Viewer (Images, Videos)
// ============================================================================

interface ArtifactViewerAuthProps {
  token: string | null;
  isSignedIn: boolean;
  hasRepoScope: boolean;
  onSignIn: () => void;
  onRequestRepoAccess: () => void;
}

interface BinaryArtifactViewerProps extends ArtifactViewerAuthProps {
  url: string;
  filename: string;
  renderContent: (blobUrl: string) => React.ReactNode;
}

function BinaryArtifactViewer({
  url,
  filename,
  token,
  isSignedIn,
  hasRepoScope,
  onSignIn,
  onRequestRepoAccess,
  renderContent,
}: BinaryArtifactViewerProps) {
  const [status, setStatus] = useState<FetchArtifactStatus | 'loading'>('loading');
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  const loadArtifact = useCallback(async () => {
    setStatus('loading');

    // Revoke previous blob URL before creating new one to prevent memory leak
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl);
      setBlobUrl(null);
    }

    const result = await fetchArtifact(url, token, true);
    setStatus(result.status);

    if (result.status === 'success' && result.blobUrl) {
      setBlobUrl(result.blobUrl);
    }
  }, [url, token, blobUrl]);

  // Load artifact on mount and when URL/token changes
  useEffect(() => {
    loadArtifact();
  }, [loadArtifact]);

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [blobUrl]);

  if (status === 'loading') {
    return (
      <div className="relative min-h-[200px]">
        <LoadingSpinner />
      </div>
    );
  }

  if (status === 'needs_auth') {
    return (
      <NeedsAuthPrompt
        filename={filename}
        isSignedIn={isSignedIn}
        hasRepoScope={hasRepoScope}
        onSignIn={onSignIn}
        onRequestRepoAccess={onRequestRepoAccess}
      />
    );
  }

  if (status === 'not_found') {
    return <ArtifactPlaceholder filename={filename} message="Artifact not found" />;
  }

  if (status === 'error' || !blobUrl) {
    return <ArtifactPlaceholder filename={filename} message="Failed to load" />;
  }

  return <>{renderContent(blobUrl)}</>;
}

// ============================================================================
// Text Artifact Viewer (JSON, Diffs)
// ============================================================================

interface TextArtifactViewerProps extends ArtifactViewerAuthProps {
  url: string;
  filename: string;
  renderContent: (content: string) => React.ReactNode;
}

function TextArtifactViewer({
  url,
  filename,
  token,
  isSignedIn,
  hasRepoScope,
  onSignIn,
  onRequestRepoAccess,
  renderContent,
}: TextArtifactViewerProps) {
  const [status, setStatus] = useState<FetchArtifactStatus | 'loading'>('loading');
  const [content, setContent] = useState<string | null>(null);

  const loadArtifact = useCallback(async () => {
    setStatus('loading');

    const result = await fetchArtifact(url, token, false);
    setStatus(result.status);

    if (result.status === 'success' && result.textContent) {
      setContent(result.textContent);
    }
  }, [url, token]);

  useEffect(() => {
    loadArtifact();
  }, [loadArtifact]);

  if (status === 'loading') {
    return (
      <div className="relative bg-surface rounded-lg p-4 min-h-[200px]">
        <LoadingSpinner />
      </div>
    );
  }

  if (status === 'needs_auth') {
    return (
      <NeedsAuthPrompt
        filename={filename}
        isSignedIn={isSignedIn}
        hasRepoScope={hasRepoScope}
        onSignIn={onSignIn}
        onRequestRepoAccess={onRequestRepoAccess}
      />
    );
  }

  if (status === 'not_found') {
    return <ArtifactPlaceholder filename={filename} message="Artifact not found" />;
  }

  if (status === 'error' || !content) {
    return <ArtifactPlaceholder filename={filename} message="Failed to load" />;
  }

  return <>{renderContent(content)}</>;
}

// ============================================================================
// Content Renderers
// ============================================================================

function JsonContent({ content, filename }: { content: string; filename: string }) {
  let displayContent = content;
  try {
    const parsed = JSON.parse(content);
    displayContent = JSON.stringify(parsed, null, 2);
  } catch {
    // Not valid JSON, show as-is
  }

  return (
    <div className="bg-muted rounded-lg p-4 overflow-x-auto max-h-96">
      <div className="text-muted-foreground text-xs mb-2">{filename}</div>
      <pre className="text-success text-sm font-mono whitespace-pre-wrap">{displayContent}</pre>
    </div>
  );
}

function DiffContent({ content, filename }: { content: string; filename: string }) {
  const lines = content.split('\n');

  return (
    <div className="bg-muted rounded-lg p-4 overflow-x-auto max-h-96">
      <div className="text-muted-foreground text-xs mb-2">{filename}</div>
      <pre className="text-sm font-mono">
        {lines.map((line, i) => {
          let className = 'text-foreground';
          if (line.startsWith('+') && !line.startsWith('+++')) className = 'text-success';
          else if (line.startsWith('-') && !line.startsWith('---')) className = 'text-danger';
          else if (line.startsWith('@@')) className = 'text-accent';
          else if (line.startsWith('diff') || line.startsWith('index')) className = 'text-muted';

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

// ============================================================================
// Shared UI Components
// ============================================================================

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

interface NeedsAuthPromptProps {
  filename: string;
  isSignedIn: boolean;
  hasRepoScope: boolean;
  onSignIn: () => void;
  onRequestRepoAccess: () => void;
}

function NeedsAuthPrompt({
  filename,
  isSignedIn,
  hasRepoScope,
  onSignIn,
  onRequestRepoAccess,
}: NeedsAuthPromptProps) {
  // Determine what action to show based on auth state
  const needsRepoUpgrade = isSignedIn && !hasRepoScope;

  return (
    <Card variant="secondary" className="text-center">
      <Card.Content className="flex flex-col items-center gap-3 py-6">
        <div className="text-muted-foreground text-sm">{filename}</div>
        <svg
          className="h-8 w-8 text-muted-foreground"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
          aria-label="Lock icon"
          role="img"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
          />
        </svg>
        <p className="text-sm text-muted-foreground">This artifact is from a private repository</p>
        {needsRepoUpgrade ? (
          <Button variant="primary" onPress={onRequestRepoAccess}>
            Grant private repo access
          </Button>
        ) : (
          <Button variant="primary" onPress={onSignIn}>
            Sign in with GitHub
          </Button>
        )}
      </Card.Content>
    </Card>
  );
}
