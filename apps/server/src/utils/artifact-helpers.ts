/**
 * Shared artifact helper functions.
 *
 * Consolidated from duplicated code across:
 * - mcp/tools/add-artifact.ts
 * - mcp/sandbox/api-wrappers.ts
 * - utils/github-artifacts.ts
 *
 * @see docs/engineering-standards.md (3+ Rule)
 */

import { readFile } from 'node:fs/promises';
import { logger } from './logger.js';

/** --- Repo String Parsing --- */

/**
 * Parse a "owner/repo" string into owner and repo components.
 * Throws if the format is invalid.
 */
export function parseRepoString(repo: string): {
  owner: string;
  repoName: string;
} {
  const parts = repo.split('/');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(`Invalid repo format: "${repo}". Expected "owner/repo".`);
  }
  return { owner: parts[0], repoName: parts[1] };
}

/** --- Content Resolution --- */

/**
 * Content source discriminated union.
 * Represents the different ways artifact content can be provided.
 */
export type ContentSource =
  | { source: 'file'; filePath: string }
  | { source: 'url'; contentUrl: string }
  | { source: 'base64'; content: string };

/**
 * Result of content resolution.
 * Either success with base64 content, or failure with error message.
 */
export type ContentResult = { success: true; content: string } | { success: false; error: string };

/**
 * Resolves artifact content from file, URL, or base64.
 * Returns base64-encoded content.
 */
export async function resolveArtifactContent(input: ContentSource): Promise<ContentResult> {
  switch (input.source) {
    case 'file': {
      logger.info({ filePath: input.filePath }, 'Reading file from path');
      try {
        const fileBuffer = await readFile(input.filePath);
        return { success: true, content: fileBuffer.toString('base64') };
      } catch (error) {
        logger.error({ error, filePath: input.filePath }, 'Failed to read file');
        const message = error instanceof Error ? error.message : 'Unknown error';
        return { success: false, error: `Failed to read file: ${message}` };
      }
    }

    case 'url': {
      logger.info({ contentUrl: input.contentUrl }, 'Fetching content from URL');
      try {
        const response = await fetch(input.contentUrl);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        return {
          success: true,
          content: Buffer.from(arrayBuffer).toString('base64'),
        };
      } catch (error) {
        logger.error({ error, contentUrl: input.contentUrl }, 'Failed to fetch URL');
        const message = error instanceof Error ? error.message : 'Unknown error';
        return { success: false, error: `Failed to fetch URL: ${message}` };
      }
    }

    case 'base64': {
      return { success: true, content: input.content };
    }
  }
}

/** --- Artifact Type Validation --- */

/**
 * Valid artifact types.
 */
export type ArtifactType = 'html' | 'image' | 'video';

/**
 * Valid file extensions for each artifact type.
 */
export const VALID_EXTENSIONS: Record<ArtifactType, string[]> = {
  html: ['html', 'htm'],
  image: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'],
  video: ['mp4', 'webm', 'mov', 'avi'],
};

/**
 * Helpful suggestions for each artifact type.
 */
export const ARTIFACT_SUGGESTIONS: Record<ArtifactType, string> = {
  html: 'HTML is the primary format for test results, terminal output, code reviews, and structured data. Use self-contained HTML with inline CSS and base64 images.',
  image:
    'Images are for actual UI screenshots only. For terminal output or test results, use type: "html" instead.',
  video:
    'Videos are for browser automation flows and complex interactions. For static content, use type: "image" or "html".',
};

/**
 * Validates that the artifact type matches the file extension.
 * Throws an error with helpful suggestions if invalid.
 *
 * @param type - The artifact type (html, image, video)
 * @param filename - The filename to validate
 * @throws Error if the file extension doesn't match the artifact type
 */
export function validateArtifactType(type: ArtifactType, filename: string): void {
  const ext = filename.split('.').pop()?.toLowerCase();

  const valid = VALID_EXTENSIONS[type];
  if (!valid || !ext || !valid.includes(ext)) {
    throw new Error(
      `Invalid file extension for artifact type '${type}'.\n\n` +
        `Expected: ${valid?.join(', ') || 'unknown'}\n` +
        `Got: ${ext || 'no extension'}\n\n` +
        `Tip: ${ARTIFACT_SUGGESTIONS[type]}`
    );
  }
}
