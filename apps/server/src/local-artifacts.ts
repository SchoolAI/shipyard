import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { logger } from './logger.js';

// ============ PUBLIC API (Exports) ============

/**
 * Store artifact bytes to local file system.
 * Returns artifactId for HTTP endpoint access.
 */
export async function storeLocalArtifact(
  planId: string,
  filename: string,
  buffer: Buffer
): Promise<string> {
  const planDir = join(ARTIFACTS_DIR, planId);
  await mkdir(planDir, { recursive: true });

  const filepath = join(planDir, filename);
  await writeFile(filepath, buffer);

  logger.info({ planId, filename, size: buffer.length }, 'Artifact stored locally');
  return `${planId}/${filename}`;
}

/**
 * Retrieve artifact bytes from local file system.
 * Returns null if artifact doesn't exist (not an error condition).
 */
export async function getLocalArtifact(artifactId: string): Promise<Buffer | null> {
  try {
    // Path traversal protection: resolve full path and verify it's within artifacts directory
    const filepath = resolve(ARTIFACTS_DIR, artifactId);

    if (!filepath.startsWith(ARTIFACTS_DIR + sep)) {
      logger.warn({ artifactId, filepath }, 'Path traversal attempt detected');
      return null;
    }

    return await readFile(filepath);
  } catch (error) {
    // File not found is expected when artifact doesn't exist
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    // Re-throw unexpected errors (permission denied, disk full, etc.)
    throw error;
  }
}

/**
 * Delete a single local artifact.
 * Used for cleanup when artifact upload to Y.Doc fails (race condition fix).
 * Returns true if deleted, false if artifact didn't exist.
 */
export async function deleteLocalArtifact(artifactId: string): Promise<boolean> {
  try {
    const filepath = resolve(ARTIFACTS_DIR, artifactId);

    // Path traversal protection
    if (!filepath.startsWith(ARTIFACTS_DIR + sep)) {
      logger.warn({ artifactId, filepath }, 'Path traversal attempt in delete');
      return false;
    }

    await rm(filepath, { force: true });
    logger.info({ artifactId }, 'Deleted orphaned local artifact');
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return false;
    }
    // Log but don't throw - cleanup is best effort
    logger.warn({ error, artifactId }, 'Failed to delete local artifact');
    return false;
  }
}

/**
 * Delete all artifacts for a plan.
 * Used for cleanup when plan is permanently deleted.
 */
export async function deleteArtifactsForPlan(planId: string): Promise<void> {
  const planDir = join(ARTIFACTS_DIR, planId);
  await rm(planDir, { recursive: true, force: true });
  logger.info({ planId }, 'Deleted all artifacts for plan');
}

// ============ PRIVATE IMPLEMENTATION ============

const ARTIFACTS_DIR = join(homedir(), '.shipyard', 'artifacts');
