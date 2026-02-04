/**
 * LevelDB storage adapter for Loro documents.
 *
 * Thin wrapper around @loro-extended/adapter-leveldb.
 * @see docs/whips/daemon-mcp-server-merge.md#4-use-loro-extended-adapters
 */

import { LevelDBStorageAdapter } from '@loro-extended/adapter-leveldb/server';
import { getDataDir } from '../../utils/paths.js';

export type { LevelDBStorageAdapter };

/**
 * Create a LevelDB storage adapter for persisting Loro documents.
 * Uses the Shipyard data directory (~/.shipyard/data).
 */
export function createStorageAdapter(): LevelDBStorageAdapter {
  const dbPath = getDataDir();
  return new LevelDBStorageAdapter(dbPath);
}
