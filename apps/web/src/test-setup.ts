/**
 * Node 25+ provides a broken empty globalThis.localStorage when --localstorage-file
 * is not set, which shadows jsdom's working implementation.
 * https://github.com/vitest-dev/vitest/issues/8757
 */
if (typeof globalThis.localStorage?.setItem !== 'function') {
  const store = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
    get length() {
      return store.size;
    },
    key: (index: number) => [...store.keys()][index] ?? null,
  };
}
