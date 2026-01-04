declare module 'y-leveldb' {
  import * as Y from 'yjs';

  export class LeveldbPersistence {
    constructor(
      location: string,
      opts?: {
        Level?: unknown;
        levelOptions?: object;
      }
    );

    tr: Promise<unknown>;

    flushDocument(docName: string): Promise<void>;
    getYDoc(docName: string): Promise<Y.Doc>;
    getStateVector(docName: string): Promise<Uint8Array>;
    storeUpdate(docName: string, update: Uint8Array): Promise<number>;
    getDiff(docName: string, stateVector: Uint8Array): Promise<Uint8Array>;
    clearDocument(docName: string): Promise<void>;
    setMeta(docName: string, metaKey: string, value: unknown): Promise<void>;
    delMeta(docName: string, metaKey: string): Promise<unknown>;
    getMeta(docName: string, metaKey: string): Promise<unknown>;
    getAllDocNames(): Promise<string[]>;
    getAllDocStateVectors(): Promise<Array<{ name: string; sv: Uint8Array; clock: number }>>;
    getMetas(docName: string): Promise<Map<string, unknown>>;
    destroy(): Promise<void>;
    clearAll(): Promise<unknown>;
  }
}
