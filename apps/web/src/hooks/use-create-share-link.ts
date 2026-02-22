import { useCallback, useState } from 'react';
import { useAuthStore } from '../stores';

interface UseCreateShareLinkProps {
  taskId: string | null;
}

interface UseCreateShareLinkResult {
  createShareLink: (expiresInMinutes: number, role?: string) => Promise<void>;
  shareUrl: string | null;
  roomId: string | null;
  collabWsUrl: string | null;
  expiresAt: number | null;
  isLoading: boolean;
  error: string | null;
  reset: () => void;
}

interface ValidatedParams {
  taskId: string;
  authToken: string;
  baseUrl: string;
}

/** Pre-flight checks. Returns validated params or an error string. */
function validateShareLinkParams(
  taskId: string | null,
  authToken: string | null
): ValidatedParams | string {
  if (!taskId) return 'No task selected';
  if (!authToken) return 'Not authenticated';
  const baseUrl = import.meta.env.VITE_SESSION_SERVER_URL;
  if (typeof baseUrl !== 'string' || baseUrl.length === 0) {
    return 'Session server URL not configured';
  }
  return { taskId, authToken, baseUrl };
}

async function fetchShareLink(
  params: ValidatedParams,
  expiresInMinutes: number,
  role?: string
): Promise<{ url: string; roomId: string; expiresAt: number }> {
  const response = await fetch(`${params.baseUrl}/collab/create`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.authToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ taskId: params.taskId, expiresInMinutes, ...(role ? { role } : {}) }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => 'Unknown error');
    throw new Error(text || `HTTP ${response.status}`);
  }

  return response.json();
}

export function useCreateShareLink({ taskId }: UseCreateShareLinkProps): UseCreateShareLinkResult {
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [collabWsUrl, setCollabWsUrl] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const authToken = useAuthStore((s) => s.token);

  const reset = useCallback(() => {
    setShareUrl(null);
    setRoomId(null);
    setCollabWsUrl(null);
    setExpiresAt(null);
    setIsLoading(false);
    setError(null);
  }, []);

  const createShareLink = useCallback(
    async (expiresInMinutes: number, role?: string) => {
      const validated = validateShareLinkParams(taskId, authToken);
      if (typeof validated === 'string') {
        setError(validated);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const data = await fetchShareLink(validated, expiresInMinutes, role);
        const serverUrl = new URL(data.url);
        const presignedToken = serverUrl.searchParams.get('token') ?? '';
        const appShareUrl = `${window.location.origin}/collab/${data.roomId}?token=${encodeURIComponent(presignedToken)}`;
        setShareUrl(appShareUrl);
        setRoomId(data.roomId);
        setExpiresAt(data.expiresAt);

        const wsBase = validated.baseUrl.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
        setCollabWsUrl(
          `${wsBase}/collab/${encodeURIComponent(data.roomId)}?token=${encodeURIComponent(presignedToken)}&userToken=${encodeURIComponent(validated.authToken)}`
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create share link');
      } finally {
        setIsLoading(false);
      }
    },
    [taskId, authToken]
  );

  return { createShareLink, shareUrl, roomId, collabWsUrl, expiresAt, isLoading, error, reset };
}
