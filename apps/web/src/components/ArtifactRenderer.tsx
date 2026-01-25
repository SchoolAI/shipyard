import { Alert, Button, Card } from '@heroui/react';
import type { Artifact } from '@shipyard/schema';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useGitHubAuth } from '../hooks/useGitHubAuth';
import {
  type FetchArtifactStatus,
  fetchArtifact,
  getArtifactUrl,
} from '../utils/github-artifact-fetcher';

interface ArtifactRendererProps {
  artifact: Artifact;
  registryPort: number | null;
}

/**
 * Renders an artifact based on its type with GitHub authentication support.
 * Handles private repo artifacts by prompting for GitHub sign-in when needed.
 * For local artifacts, checks availability and shows warning if not accessible.
 */
export function ArtifactRenderer({ artifact, registryPort }: ArtifactRendererProps) {
  const { identity, hasRepoScope, startAuth, requestRepoAccess } = useGitHubAuth();
  const token = identity?.token ?? null;
  const isSignedIn = identity !== null;

  // For local artifacts, check availability before rendering
  // Local artifacts may not be available if viewing on a different machine
  if (artifact.storage === 'local') {
    return (
      <LocalArtifactViewer
        artifact={artifact}
        registryPort={registryPort}
        token={token}
        isSignedIn={isSignedIn}
        hasRepoScope={hasRepoScope}
        onSignIn={startAuth}
        onRequestRepoAccess={requestRepoAccess}
      />
    );
  }

  // GitHub artifacts - use existing viewer logic
  const url = artifact.url;

  switch (artifact.type) {
    case 'html':
      return (
        <HtmlViewer
          url={url}
          filename={artifact.filename}
          token={token}
          isSignedIn={isSignedIn}
          hasRepoScope={hasRepoScope}
          onSignIn={startAuth}
          onRequestRepoAccess={requestRepoAccess}
        />
      );

    case 'image':
      return (
        <BinaryArtifactViewer
          url={url}
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
          url={url}
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

    default: {
      const _exhaustive: never = artifact.type;
      return (
        <ArtifactPlaceholder
          filename={artifact.filename}
          message={`Unknown type: ${String(_exhaustive)}`}
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

  // Track blob URL in ref to avoid infinite loop in useCallback dependencies
  const blobUrlRef = useRef<string | null>(null);
  // Only show loading state on initial load, not re-fetches
  const isInitialLoad = useRef(true);

  const loadArtifact = useCallback(async () => {
    // Only show loading on initial load to prevent flash on re-fetch
    if (isInitialLoad.current) {
      setStatus('loading');
    }

    // Revoke previous blob URL to prevent memory leak
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }

    const result = await fetchArtifact(url, token, true, hasRepoScope);
    setStatus(result.status);

    if (result.status === 'success' && result.blobUrl) {
      blobUrlRef.current = result.blobUrl;
      setBlobUrl(result.blobUrl);
    } else {
      setBlobUrl(null);
    }

    isInitialLoad.current = false;
  }, [url, token, hasRepoScope]); // Remove blobUrl from dependencies

  // Load artifact on mount and when URL/token changes
  useEffect(() => {
    loadArtifact();
  }, [loadArtifact]);

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
      }
    };
  }, []);

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

// ============================================================================
// HTML Artifact Viewer
// ============================================================================

interface HtmlViewerProps extends ArtifactViewerAuthProps {
  url: string;
  filename: string;
}

/**
 * Renders HTML artifacts in a sandboxed iframe.
 * SECURITY: Uses strict sandbox without allow-same-origin to prevent XSS.
 */
function HtmlViewer({
  url,
  filename,
  token,
  isSignedIn,
  hasRepoScope,
  onSignIn,
  onRequestRepoAccess,
}: HtmlViewerProps) {
  const [status, setStatus] = useState<FetchArtifactStatus | 'loading'>('loading');
  const [content, setContent] = useState<string | null>(null);

  // Only show loading state on initial load, not re-fetches
  const isInitialLoad = useRef(true);

  const loadArtifact = useCallback(async () => {
    // Only show loading on initial load to prevent flash on re-fetch
    if (isInitialLoad.current) {
      setStatus('loading');
    }

    const result = await fetchArtifact(url, token, false, hasRepoScope);
    setStatus(result.status);

    if (result.status === 'success' && result.textContent) {
      setContent(result.textContent);
    }

    isInitialLoad.current = false;
  }, [url, token, hasRepoScope]);

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

  return (
    <iframe
      sandbox="allow-scripts"
      srcDoc={content}
      title={filename}
      className="w-full min-h-96 border rounded-lg bg-white"
    />
  );
}

// ============================================================================
// Local Artifact Viewer (With Availability Check)
// ============================================================================

interface LocalArtifactViewerProps extends ArtifactViewerAuthProps {
  artifact: Artifact & { storage: 'local' };
  registryPort: number | null;
}

/**
 * Viewer for local artifacts served by the MCP server.
 * Checks availability first and shows warning if artifact is not accessible
 * (e.g., viewing plan on a different machine than where it was created).
 */
function LocalArtifactViewer({
  artifact,
  registryPort,
  token,
  isSignedIn,
  hasRepoScope,
  onSignIn,
  onRequestRepoAccess,
}: LocalArtifactViewerProps) {
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null);
  const url = getArtifactUrl(artifact, registryPort);

  // Check if artifact is available on this machine
  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();

    const checkAvailability = async () => {
      try {
        const response = await fetch(url, {
          method: 'HEAD',
          signal: controller.signal,
        });
        if (mounted) {
          setIsAvailable(response.ok);
        }
      } catch (error) {
        if (!(error instanceof Error && error.name === 'AbortError') && mounted) {
          setIsAvailable(false);
        }
      }
    };

    checkAvailability();

    return () => {
      mounted = false;
      controller.abort();
    };
  }, [url]);

  // Show loading while checking availability
  if (isAvailable === null) {
    return (
      <div className="relative min-h-[100px]">
        <LoadingSpinner />
      </div>
    );
  }

  // Show warning if artifact is not available
  if (!isAvailable) {
    return (
      <Alert status="warning">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>Artifact not available</Alert.Title>
          <Alert.Description>
            This artifact is stored locally and is not accessible on this device. It may have been
            created on a different machine.
          </Alert.Description>
        </Alert.Content>
      </Alert>
    );
  }

  // Artifact is available - render based on type using exhaustive switch
  switch (artifact.type) {
    case 'html':
      return (
        <HtmlViewer
          url={url}
          filename={artifact.filename}
          token={token}
          isSignedIn={isSignedIn}
          hasRepoScope={hasRepoScope}
          onSignIn={onSignIn}
          onRequestRepoAccess={onRequestRepoAccess}
        />
      );
    case 'image':
      return (
        <BinaryArtifactViewer
          url={url}
          filename={artifact.filename}
          token={token}
          isSignedIn={isSignedIn}
          hasRepoScope={hasRepoScope}
          onSignIn={onSignIn}
          onRequestRepoAccess={onRequestRepoAccess}
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
          url={url}
          filename={artifact.filename}
          token={token}
          isSignedIn={isSignedIn}
          hasRepoScope={hasRepoScope}
          onSignIn={onSignIn}
          onRequestRepoAccess={onRequestRepoAccess}
          renderContent={(blobUrl) => (
            <video src={blobUrl} controls className="max-w-full rounded-lg border border-separator">
              <track kind="captions" />
              Your browser does not support video playback.
            </video>
          )}
        />
      );
    default: {
      const _exhaustive: never = artifact.type;
      return (
        <ArtifactPlaceholder
          filename={artifact.filename}
          message={`Unknown type: ${String(_exhaustive)}`}
        />
      );
    }
  }
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
