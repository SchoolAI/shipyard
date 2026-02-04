/**
 * Tests for artifact helper functions.
 *
 * Interface tests per engineering-standards.md 3+ Rule:
 * Code used in 3+ places needs interface tests.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Mock logger before import */
vi.mock('./logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

/** Mock fs/promises for file reading tests */
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
}));

/** Import after mocks */
import { readFile } from 'node:fs/promises';
import {
  ARTIFACT_SUGGESTIONS,
  type ArtifactType,
  parseRepoString,
  resolveArtifactContent,
  VALID_EXTENSIONS,
  validateArtifactType,
} from './artifact-helpers.js';

describe('artifact-helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('parseRepoString', () => {
    it('parses valid owner/repo format', () => {
      const result = parseRepoString('owner/repo');
      expect(result).toEqual({ owner: 'owner', repoName: 'repo' });
    });

    it('parses repo with hyphens and numbers', () => {
      const result = parseRepoString('my-org/my-repo-123');
      expect(result).toEqual({ owner: 'my-org', repoName: 'my-repo-123' });
    });

    it('throws for invalid format (no slash)', () => {
      expect(() => parseRepoString('invalid')).toThrow(
        'Invalid repo format: "invalid". Expected "owner/repo".'
      );
    });

    it('throws for empty owner', () => {
      expect(() => parseRepoString('/repo')).toThrow(
        'Invalid repo format: "/repo". Expected "owner/repo".'
      );
    });

    it('throws for empty repo', () => {
      expect(() => parseRepoString('owner/')).toThrow(
        'Invalid repo format: "owner/". Expected "owner/repo".'
      );
    });

    it('throws for too many slashes', () => {
      expect(() => parseRepoString('owner/repo/extra')).toThrow(
        'Invalid repo format: "owner/repo/extra". Expected "owner/repo".'
      );
    });

    it('throws for empty string', () => {
      expect(() => parseRepoString('')).toThrow('Invalid repo format');
    });
  });

  describe('resolveArtifactContent', () => {
    describe('source: file', () => {
      it('reads file and returns base64 content', async () => {
        const mockBuffer = Buffer.from('file content');
        vi.mocked(readFile).mockResolvedValue(mockBuffer);

        const result = await resolveArtifactContent({
          source: 'file',
          filePath: '/path/to/file.png',
        });

        expect(result).toEqual({
          success: true,
          content: mockBuffer.toString('base64'),
        });
        expect(readFile).toHaveBeenCalledWith('/path/to/file.png');
      });

      it('returns error when file read fails', async () => {
        vi.mocked(readFile).mockRejectedValue(new Error('ENOENT: no such file'));

        const result = await resolveArtifactContent({
          source: 'file',
          filePath: '/nonexistent/file.png',
        });

        expect(result).toEqual({
          success: false,
          error: 'Failed to read file: ENOENT: no such file',
        });
      });
    });

    describe('source: url', () => {
      it('fetches URL and returns base64 content', async () => {
        const mockResponse = {
          ok: true,
          arrayBuffer: vi.fn().mockResolvedValue(new TextEncoder().encode('url content').buffer),
        };
        global.fetch = vi.fn().mockResolvedValue(mockResponse);

        const result = await resolveArtifactContent({
          source: 'url',
          contentUrl: 'https://example.com/image.png',
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.content).toBe(Buffer.from('url content').toString('base64'));
        }
        expect(fetch).toHaveBeenCalledWith('https://example.com/image.png');
      });

      it('returns error when URL fetch fails with HTTP error', async () => {
        const mockResponse = {
          ok: false,
          status: 404,
          statusText: 'Not Found',
        };
        global.fetch = vi.fn().mockResolvedValue(mockResponse);

        const result = await resolveArtifactContent({
          source: 'url',
          contentUrl: 'https://example.com/notfound.png',
        });

        expect(result).toEqual({
          success: false,
          error: 'Failed to fetch URL: HTTP 404: Not Found',
        });
      });

      it('returns error when fetch throws', async () => {
        global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

        const result = await resolveArtifactContent({
          source: 'url',
          contentUrl: 'https://invalid.example.com/image.png',
        });

        expect(result).toEqual({
          success: false,
          error: 'Failed to fetch URL: Network error',
        });
      });
    });

    describe('source: base64', () => {
      it('returns base64 content as-is', async () => {
        const base64Content = 'SGVsbG8gV29ybGQ='; // "Hello World" in base64

        const result = await resolveArtifactContent({
          source: 'base64',
          content: base64Content,
        });

        expect(result).toEqual({
          success: true,
          content: base64Content,
        });
      });
    });
  });

  describe('validateArtifactType', () => {
    describe('html type', () => {
      it('accepts .html extension', () => {
        expect(() => validateArtifactType('html', 'report.html')).not.toThrow();
      });

      it('accepts .htm extension', () => {
        expect(() => validateArtifactType('html', 'report.htm')).not.toThrow();
      });

      it('rejects non-html extensions', () => {
        expect(() => validateArtifactType('html', 'report.png')).toThrow(
          "Invalid file extension for artifact type 'html'"
        );
      });
    });

    describe('image type', () => {
      const validImageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'];

      for (const ext of validImageExtensions) {
        it(`accepts .${ext} extension`, () => {
          expect(() => validateArtifactType('image', `screenshot.${ext}`)).not.toThrow();
        });
      }

      it('rejects non-image extensions', () => {
        expect(() => validateArtifactType('image', 'doc.pdf')).toThrow(
          "Invalid file extension for artifact type 'image'"
        );
      });
    });

    describe('video type', () => {
      const validVideoExtensions = ['mp4', 'webm', 'mov', 'avi'];

      for (const ext of validVideoExtensions) {
        it(`accepts .${ext} extension`, () => {
          expect(() => validateArtifactType('video', `recording.${ext}`)).not.toThrow();
        });
      }

      it('rejects non-video extensions', () => {
        expect(() => validateArtifactType('video', 'movie.txt')).toThrow(
          "Invalid file extension for artifact type 'video'"
        );
      });
    });

    describe('edge cases', () => {
      it('handles case-insensitive extensions', () => {
        expect(() => validateArtifactType('image', 'screenshot.PNG')).not.toThrow();
        expect(() => validateArtifactType('image', 'screenshot.Jpg')).not.toThrow();
      });

      it('rejects files without extensions', () => {
        expect(() => validateArtifactType('image', 'noextension')).toThrow('Got: noextension');
      });

      it('uses last extension for multi-dot filenames', () => {
        expect(() => validateArtifactType('image', 'file.backup.png')).not.toThrow();
      });

      it('includes helpful suggestion in error message', () => {
        try {
          validateArtifactType('html', 'wrong.png');
        } catch (error) {
          expect((error as Error).message).toContain('Tip:');
          expect((error as Error).message).toContain(ARTIFACT_SUGGESTIONS.html);
        }
      });
    });
  });

  describe('VALID_EXTENSIONS constant', () => {
    it('has entries for all artifact types', () => {
      const types: ArtifactType[] = ['html', 'image', 'video'];
      for (const type of types) {
        expect(VALID_EXTENSIONS[type]).toBeDefined();
        expect(Array.isArray(VALID_EXTENSIONS[type])).toBe(true);
        expect(VALID_EXTENSIONS[type].length).toBeGreaterThan(0);
      }
    });
  });

  describe('ARTIFACT_SUGGESTIONS constant', () => {
    it('has suggestions for all artifact types', () => {
      const types: ArtifactType[] = ['html', 'image', 'video'];
      for (const type of types) {
        expect(ARTIFACT_SUGGESTIONS[type]).toBeDefined();
        expect(typeof ARTIFACT_SUGGESTIONS[type]).toBe('string');
        expect(ARTIFACT_SUGGESTIONS[type].length).toBeGreaterThan(0);
      }
    });
  });
});
