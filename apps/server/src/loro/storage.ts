/**
 * LevelDB storage adapter for Loro documents.
 *
 * Thin wrapper around @loro-extended/adapter-leveldb.
 * @see docs/whips/daemon-mcp-server-merge.md#4-use-loro-extended-adapters
 */

// TODO: Import from @loro-extended/adapter-leveldb/server
// import { LevelDBStorageAdapter } from '@loro-extended/adapter-leveldb/server'

import type { Env } from "../env.js";

/**
 * Storage adapter interface (placeholder until loro-extended types available).
 */
export interface StorageAdapter {
	// TODO: Define based on loro-extended adapter interface
	close(): Promise<void>;
}

/**
 * Create a LevelDB storage adapter for persisting Loro documents.
 */
export function createStorage(_env: Env): StorageAdapter {
	// TODO: Implement using LevelDBStorageAdapter
	// return new LevelDBStorageAdapter(env.DATA_DIR)
	throw new Error("Not implemented");
}
