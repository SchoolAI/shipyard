import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FileStorageAdapter } from './file-storage-adapter.js';

describe('FileStorageAdapter', () => {
  let adapter: FileStorageAdapter;
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `shipyard-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(testDir, { recursive: true, mode: 0o700 });
    adapter = new FileStorageAdapter(testDir);
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('save and load', () => {
    it('roundtrips data', async () => {
      const key = ['docs', 'task-123'];
      const data = new Uint8Array([1, 2, 3, 4, 5]);

      await adapter.save(key, data);
      const loaded = await adapter.load(key);

      expect(loaded).toEqual(data);
    });

    it('returns undefined for missing key', async () => {
      const result = await adapter.load(['nonexistent']);
      expect(result).toBeUndefined();
    });

    it('creates directories as needed', async () => {
      const key = ['deep', 'nested', 'dir', 'file'];
      const data = new Uint8Array([42]);

      await adapter.save(key, data);
      const loaded = await adapter.load(key);

      expect(loaded).toEqual(data);
    });

    it('overwrites existing data', async () => {
      const key = ['overwrite'];
      await adapter.save(key, new Uint8Array([1]));
      await adapter.save(key, new Uint8Array([2]));

      const loaded = await adapter.load(key);
      expect(loaded).toEqual(new Uint8Array([2]));
    });

    it('handles empty data', async () => {
      const key = ['empty'];
      await adapter.save(key, new Uint8Array(0));

      const loaded = await adapter.load(key);
      expect(loaded).toEqual(new Uint8Array(0));
    });

    it('sets restrictive file permissions', async () => {
      const key = ['secure'];
      await adapter.save(key, new Uint8Array([1]));

      const filePath = join(testDir, 'secure');
      const stats = await stat(filePath);
      const mode = stats.mode & 0o777;
      expect(mode).toBe(0o600);
    });
  });

  describe('remove', () => {
    it('removes existing key', async () => {
      const key = ['to-remove'];
      await adapter.save(key, new Uint8Array([1]));
      await adapter.remove(key);

      const loaded = await adapter.load(key);
      expect(loaded).toBeUndefined();
    });

    it('does not throw for missing key', async () => {
      await expect(adapter.remove(['missing'])).resolves.toBeUndefined();
    });
  });

  describe('loadRange', () => {
    it('loads all chunks matching prefix', async () => {
      await adapter.save(['docs', 'task-1'], new Uint8Array([1]));
      await adapter.save(['docs', 'task-2'], new Uint8Array([2]));
      await adapter.save(['other', 'file'], new Uint8Array([3]));

      const chunks = await adapter.loadRange(['docs']);

      expect(chunks).toHaveLength(2);
      const keys = chunks.map((c) => c.key);
      expect(keys).toContainEqual(['docs', 'task-1']);
      expect(keys).toContainEqual(['docs', 'task-2']);
    });

    it('returns empty array for no matches', async () => {
      const chunks = await adapter.loadRange(['nonexistent']);
      expect(chunks).toEqual([]);
    });

    it('ignores .tmp files', async () => {
      await adapter.save(['docs', 'real'], new Uint8Array([1]));
      const tmpPath = join(testDir, 'docs', 'partial.tmp');
      await mkdir(join(testDir, 'docs'), { recursive: true });
      await writeFile(tmpPath, new Uint8Array([99]));

      const chunks = await adapter.loadRange(['docs']);
      expect(chunks).toHaveLength(1);
      expect(chunks[0]?.key).toEqual(['docs', 'real']);
    });
  });

  describe('removeRange', () => {
    it('removes all chunks matching prefix', async () => {
      await adapter.save(['docs', 'task-1'], new Uint8Array([1]));
      await adapter.save(['docs', 'task-2'], new Uint8Array([2]));
      await adapter.save(['other', 'keep'], new Uint8Array([3]));

      await adapter.removeRange(['docs']);

      expect(await adapter.load(['docs', 'task-1'])).toBeUndefined();
      expect(await adapter.load(['docs', 'task-2'])).toBeUndefined();
      expect(await adapter.load(['other', 'keep'])).toEqual(new Uint8Array([3]));
    });
  });

  describe('key encoding', () => {
    it('handles special characters in keys', async () => {
      const key = ['docs', 'task:abc:2'];
      const data = new Uint8Array([10, 20]);

      await adapter.save(key, data);
      const loaded = await adapter.load(key);

      expect(loaded).toEqual(data);
    });
  });
});
