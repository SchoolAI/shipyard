import type { Dirent } from 'node:fs';
import { mkdir, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, sep } from 'node:path';
import { type Chunk, StorageAdapter, type StorageKey } from '@loro-extended/repo';

export class FileStorageAdapter extends StorageAdapter {
  readonly #dataDir: string;

  constructor(dataDir: string) {
    super({ adapterType: 'file' });
    this.#dataDir = dataDir;
  }

  async load(key: StorageKey): Promise<Uint8Array | undefined> {
    const filePath = this.#keyToPath(key);
    try {
      const buffer = await readFile(filePath);
      return new Uint8Array(buffer);
    } catch {}
    return undefined;
  }

  async save(key: StorageKey, data: Uint8Array): Promise<void> {
    const filePath = this.#keyToPath(key);
    const dir = dirname(filePath);
    await mkdir(dir, { recursive: true, mode: 0o700 });

    const tmpPath = `${filePath}.tmp`;
    await writeFile(tmpPath, data, { mode: 0o600 });
    await rename(tmpPath, filePath);
  }

  async remove(key: StorageKey): Promise<void> {
    const filePath = this.#keyToPath(key);
    try {
      await unlink(filePath);
    } catch {}
  }

  async loadRange(keyPrefix: StorageKey): Promise<Chunk[]> {
    const results: Chunk[] = [];
    await this.#walkDir(this.#dataDir, keyPrefix, results);
    return results;
  }

  async removeRange(keyPrefix: StorageKey): Promise<void> {
    const chunks = await this.loadRange(keyPrefix);
    await Promise.all(chunks.map((chunk) => this.remove(chunk.key)));
  }

  #keyToPath(key: StorageKey): string {
    const sanitized = key.map((part) => encodeURIComponent(part));
    return join(this.#dataDir, ...sanitized);
  }

  #pathToKey(filePath: string): StorageKey {
    const relative = filePath.slice(this.#dataDir.length + 1);
    return relative.split(sep).map((part) => decodeURIComponent(part));
  }

  #isPrefix(prefix: StorageKey, key: StorageKey): boolean {
    if (prefix.length > key.length) return false;
    return prefix.every((val, i) => val === key[i]);
  }

  async #walkDir(dir: string, keyPrefix: StorageKey, results: Chunk[]): Promise<void> {
    let entries: Dirent[];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        await this.#walkDir(fullPath, keyPrefix, results);
      } else if (entry.isFile() && !entry.name.endsWith('.tmp')) {
        const key = this.#pathToKey(fullPath);
        if (this.#isPrefix(keyPrefix, key)) {
          const data = await readFile(fullPath);
          results.push({ key, data: new Uint8Array(data) });
        }
      }
    }
  }
}
