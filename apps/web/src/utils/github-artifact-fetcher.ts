import { z } from 'zod';

const GitHubContentsResponseSchema = z.object({
  content: z.string().optional(),
  encoding: z.string().optional(),
});

export type FetchArtifactStatus = 'success' | 'needs_auth' | 'not_found' | 'error';

export type FetchArtifactResult =
  | { status: 'success'; blobUrl?: string; textContent?: string }
  | { status: 'needs_auth' }
  | { status: 'not_found' }
  | { status: 'error'; error: string };

export interface ParsedArtifactUrl {
  owner: string;
  repo: string;
  ref: string;
  path: string;
}

export interface ArtifactItem {
  storage: 'github';
  url: string;
  id: string;
  type: string;
  filename: string;
}

export function getArtifactUrl(artifact: ArtifactItem, _registryPort: number | null): string {
  return artifact.url;
}

export function parseArtifactUrl(url: string): ParsedArtifactUrl | null {
  try {
    const parsed = new URL(url);

    if (parsed.hostname !== 'raw.githubusercontent.com') {
      return null;
    }

    const parts = parsed.pathname.split('/').filter(Boolean);

    if (parts.length < 4) {
      return null;
    }

    const owner = parts[0];
    const repo = parts[1];
    const ref = parts[2];
    if (!owner || !repo || !ref) return null;
    const path = parts.slice(3).join('/');

    return { owner, repo, ref, path };
  } catch {
    return null;
  }
}

export async function fetchArtifact(
  url: string,
  token: string | null,
  isBinary: boolean,
  hasRepoScope = false
): Promise<FetchArtifactResult> {
  const parsed = parseArtifactUrl(url);

  if (!parsed) {
    return fetchDirect(url, isBinary);
  }

  if (!token) {
    const directResult = await fetchDirect(url, isBinary);
    if (directResult.status === 'not_found' || directResult.status === 'needs_auth') {
      return { status: 'needs_auth' };
    }
    return directResult;
  }

  return fetchViaGitHubApi(parsed, token, isBinary, hasRepoScope);
}

async function fetchDirect(url: string, isBinary: boolean): Promise<FetchArtifactResult> {
  try {
    const response = await fetch(url);

    if (!response.ok) {
      if (response.status === 403 || response.status === 401) {
        return { status: 'needs_auth' };
      }
      if (response.status === 404) {
        return { status: 'not_found' };
      }
      return { status: 'error', error: `HTTP ${response.status}` };
    }

    if (isBinary) {
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      return { status: 'success', blobUrl };
    }

    const textContent = await response.text();
    return { status: 'success', textContent };
  } catch (err) {
    return {
      status: 'error',
      error: err instanceof Error ? err.message : 'Network error',
    };
  }
}

function mapGitHubErrorStatus(status: number, hasRepoScope: boolean): FetchArtifactResult {
  if (status === 401 || status === 403) {
    return { status: 'needs_auth' };
  }
  if (status === 404) {
    return hasRepoScope ? { status: 'not_found' } : { status: 'needs_auth' };
  }
  return { status: 'error', error: `GitHub API: ${status}` };
}

function decodeAsBlobUrl(base64Content: string, path: string): string {
  const decodedContent = atob(base64Content.replace(/\n/g, ''));
  const bytes = new Uint8Array(decodedContent.length);
  for (let i = 0; i < decodedContent.length; i++) {
    bytes[i] = decodedContent.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: getMimeType(path) });
  return URL.createObjectURL(blob);
}

async function fetchViaGitHubApi(
  parsed: ParsedArtifactUrl,
  token: string,
  isBinary: boolean,
  hasRepoScope: boolean
): Promise<FetchArtifactResult> {
  const apiUrl = `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/contents/${parsed.path}?ref=${parsed.ref}`;

  try {
    const response = await fetch(apiUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (!response.ok) {
      return mapGitHubErrorStatus(response.status, hasRepoScope);
    }

    const json: unknown = await response.json();
    const parseResult = GitHubContentsResponseSchema.safeParse(json);
    if (!parseResult.success) {
      return { status: 'error', error: 'Unexpected API response format' };
    }
    const data = parseResult.data;

    if (!data.content || data.encoding !== 'base64') {
      return { status: 'error', error: 'Unexpected API response format' };
    }

    if (isBinary) {
      const blobUrl = decodeAsBlobUrl(data.content, parsed.path);
      return { status: 'success', blobUrl };
    }

    const decodedContent = atob(data.content.replace(/\n/g, ''));
    return { status: 'success', textContent: decodedContent };
  } catch (err) {
    return {
      status: 'error',
      error: err instanceof Error ? err.message : 'Network error',
    };
  }
}

function getMimeType(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  const mimeTypes: Record<string, string> = {
    html: 'text/html',
    htm: 'text/html',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    mp4: 'video/mp4',
    webm: 'video/webm',
    mov: 'video/quicktime',
  };
  return mimeTypes[ext || ''] || 'application/octet-stream';
}
