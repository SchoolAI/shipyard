/**
 * GitHub artifact fetcher with authentication support for private repos.
 *
 * Uses GitHub Contents API instead of raw.githubusercontent.com because:
 * - raw.githubusercontent.com doesn't support CORS with auth headers
 * - GitHub API supports Bearer token auth with CORS
 */

// ============================================================================
// Public Types
// ============================================================================

export type FetchArtifactStatus = 'success' | 'needs_auth' | 'not_found' | 'error';

export interface FetchArtifactResult {
  status: FetchArtifactStatus;
  blobUrl?: string;
  textContent?: string;
  error?: string;
}

export interface ParsedArtifactUrl {
  owner: string;
  repo: string;
  ref: string;
  path: string;
}

// ============================================================================
// Public Functions
// ============================================================================

/**
 * Parse a raw.githubusercontent.com URL to extract GitHub repo info.
 *
 * @example
 * parseArtifactUrl('https://raw.githubusercontent.com/owner/repo/plan-artifacts/plans/abc/file.png')
 * // => { owner: 'owner', repo: 'repo', ref: 'plan-artifacts', path: 'plans/abc/file.png' }
 */
export function parseArtifactUrl(url: string): ParsedArtifactUrl | null {
  try {
    const parsed = new URL(url);

    if (parsed.hostname !== 'raw.githubusercontent.com') {
      return null;
    }

    // Path format: /owner/repo/ref/path/to/file
    const parts = parsed.pathname.split('/').filter(Boolean);

    if (parts.length < 4) {
      return null;
    }

    // Length check above guarantees at least 4 elements
    const owner = parts[0] as string;
    const repo = parts[1] as string;
    const ref = parts[2] as string;
    const path = parts.slice(3).join('/');

    return { owner, repo, ref, path };
  } catch {
    return null;
  }
}

/**
 * Fetch artifact content via GitHub API with optional authentication.
 *
 * For binary files (images/video), returns a blob URL that can be used in <img>/<video>.
 * For text files (JSON/diff), returns the text content directly.
 *
 * Falls back to direct URL fetch for public repos when no token is provided.
 *
 * @param hasRepoScope - Whether the token has `repo` scope (affects 404 interpretation)
 */
export async function fetchArtifact(
  url: string,
  token: string | null,
  isBinary: boolean,
  hasRepoScope = false
): Promise<FetchArtifactResult> {
  const parsed = parseArtifactUrl(url);

  // If we can't parse as GitHub URL, try direct fetch (might be public)
  if (!parsed) {
    return fetchDirect(url, isBinary);
  }

  // If no token, try direct fetch first (works for public repos)
  if (!token) {
    const directResult = await fetchDirect(url, isBinary);
    // 404 on raw.githubusercontent.com could mean private repo (not truly missing)
    // 403 definitely means needs auth
    if (directResult.status === 'not_found' || directResult.status === 'needs_auth') {
      return { status: 'needs_auth' };
    }
    return directResult;
  }

  // Fetch via GitHub API with auth
  return fetchViaGitHubApi(parsed, token, isBinary, hasRepoScope);
}

// ============================================================================
// Private Implementation
// ============================================================================

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

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: GitHub API error handling requires multiple branches
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
      if (response.status === 401 || response.status === 403) {
        return { status: 'needs_auth' };
      }
      if (response.status === 404) {
        // 404 could mean "not found" OR "insufficient permissions"
        // If user doesn't have repo scope, treat as needs_auth
        if (!hasRepoScope) {
          return { status: 'needs_auth' };
        }
        return { status: 'not_found' };
      }
      return { status: 'error', error: `GitHub API: ${response.status}` };
    }

    const data = (await response.json()) as {
      content?: string;
      encoding?: string;
    };

    // GitHub Contents API returns base64-encoded content
    if (!data.content || data.encoding !== 'base64') {
      return { status: 'error', error: 'Unexpected API response format' };
    }

    const decodedContent = atob(data.content.replace(/\n/g, ''));

    if (isBinary) {
      // Convert decoded string to blob
      const bytes = new Uint8Array(decodedContent.length);
      for (let i = 0; i < decodedContent.length; i++) {
        bytes[i] = decodedContent.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: getMimeType(parsed.path) });
      const blobUrl = URL.createObjectURL(blob);
      return { status: 'success', blobUrl };
    }

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
