import { Button, Card } from '@heroui/react';
import type { TaskArtifact } from '@shipyard/loro-schema';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useGitHubAuth } from '@/hooks/use-github-auth';

type ArtifactType = TaskArtifact[number];

interface ArtifactRendererProps {
  artifact: ArtifactType;
}

type FetchArtifactStatus = 'success' | 'needs_auth' | 'not_found' | 'error';

interface FetchArtifactResult {
  status: FetchArtifactStatus;
  blobUrl?: string;
  textContent?: string;
}

function isGitHubUrl(url: string): boolean {
  return url.includes('github.com') || url.includes('githubusercontent.com');
}

async function fetchArtifact(
  url: string,
  token: string | null,
  isBinary: boolean,
  hasRepoScope: boolean
): Promise<FetchArtifactResult> {
  try {
    const headers: Record<string, string> = {
      Accept: isBinary ? '*/*' : 'application/vnd.github.v3.raw',
    };

    if (token && isGitHubUrl(url) && hasRepoScope) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(url, { headers });

    if (response.status === 401 || response.status === 403) {
      return { status: 'needs_auth' };
    }

    if (response.status === 404) {
      return { status: 'not_found' };
    }

    if (!response.ok) {
      return { status: 'error' };
    }

    if (isBinary) {
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      return { status: 'success', blobUrl };
    }

    const textContent = await response.text();
    return { status: 'success', textContent };
  } catch {
    return { status: 'error' };
  }
}

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
  hasRepoScope,
  isSignedIn,
  onSignIn,
  onRequestRepoAccess,
  renderContent,
}: BinaryArtifactViewerProps) {
  const [status, setStatus] = useState<FetchArtifactStatus | 'loading'>('loading');
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  const isInitialLoad = useRef(true);

  const loadArtifact = useCallback(async () => {
    if (isInitialLoad.current) {
      setStatus('loading');
    }

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
  }, [url, token, hasRepoScope]);

  useEffect(() => {
    loadArtifact();
  }, [loadArtifact]);

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

interface HtmlViewerProps extends ArtifactViewerAuthProps {
  url: string;
  filename: string;
}

function HtmlViewer({
  url,
  filename,
  token,
  hasRepoScope,
  isSignedIn,
  onSignIn,
  onRequestRepoAccess,
}: HtmlViewerProps) {
  const [status, setStatus] = useState<FetchArtifactStatus | 'loading'>('loading');
  const [content, setContent] = useState<string | null>(null);
  const isInitialLoad = useRef(true);

  const loadArtifact = useCallback(async () => {
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
      className="w-full min-h-96 border rounded-lg bg-surface"
    />
  );
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

export function ArtifactRenderer({ artifact }: ArtifactRendererProps) {
  const { identity, hasRepoScope, startAuth, requestRepoAccess } = useGitHubAuth();
  const token = identity?.token ?? null;
  const isSignedIn = identity !== null;

  if (artifact.storage !== 'github') {
    return <ArtifactPlaceholder filename={artifact.filename} message="Unsupported storage type" />;
  }

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
      void _exhaustive;
      return <ArtifactPlaceholder filename={artifact.filename} message="Unknown artifact type" />;
    }
  }
}
