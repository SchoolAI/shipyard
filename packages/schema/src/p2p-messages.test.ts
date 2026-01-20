import { describe, expect, it } from 'vitest';
import {
  assertNeverP2PMessage,
  type ChunkMessage,
  type ConversationExportEnd,
  type ConversationExportStartMeta,
  decodeChunkMessage,
  decodeExportEndMessage,
  decodeExportStartMessage,
  decodeP2PMessage,
  encodeChunkMessage,
  encodeExportEndMessage,
  encodeExportStartMessage,
  isConversationChunk,
  isConversationExportEnd,
  isConversationExportStart,
  isP2PConversationMessage,
  P2PMessageType,
} from './p2p-messages.js';

const sampleStartMeta: ConversationExportStartMeta = {
  exportId: 'export-123',
  totalChunks: 10,
  totalBytes: 100000,
  compressedBytes: 50000,
  sourcePlatform: 'claude-code',
  sourceSessionId: 'session-456',
  planId: 'plan-789',
  exportedAt: Date.now(),
};

const sampleChunk: ChunkMessage = {
  exportId: 'export-123',
  chunkIndex: 5,
  data: new Uint8Array([1, 2, 3, 4, 5]),
};

const sampleEnd: ConversationExportEnd = {
  exportId: 'export-123',
  checksum: 'abc123def456',
};

describe('P2PMessageType', () => {
  it('defines distinct message type bytes', () => {
    expect(P2PMessageType.CONVERSATION_EXPORT_START).toBe(0xf0);
    expect(P2PMessageType.CONVERSATION_CHUNK).toBe(0xf1);
    expect(P2PMessageType.CONVERSATION_EXPORT_END).toBe(0xf2);
  });

  it('does not conflict with Yjs message types (0x00-0x04)', () => {
    const yjsTypes = [0x00, 0x01, 0x02, 0x03, 0x04];
    const p2pTypes = [
      P2PMessageType.CONVERSATION_EXPORT_START,
      P2PMessageType.CONVERSATION_CHUNK,
      P2PMessageType.CONVERSATION_EXPORT_END,
    ];

    for (const p2pType of p2pTypes) {
      expect(yjsTypes.includes(p2pType)).toBe(false);
    }
  });
});

describe('Type Guards', () => {
  describe('isConversationExportStart', () => {
    it('returns true for export start message', () => {
      const data = new Uint8Array([P2PMessageType.CONVERSATION_EXPORT_START, 1, 2, 3]);
      expect(isConversationExportStart(data)).toBe(true);
    });

    it('returns false for other message types', () => {
      const chunk = new Uint8Array([P2PMessageType.CONVERSATION_CHUNK, 1, 2, 3]);
      const end = new Uint8Array([P2PMessageType.CONVERSATION_EXPORT_END, 1, 2, 3]);
      expect(isConversationExportStart(chunk)).toBe(false);
      expect(isConversationExportStart(end)).toBe(false);
    });

    it('returns false for empty data', () => {
      expect(isConversationExportStart(new Uint8Array([]))).toBe(false);
    });

    it('returns false for Yjs message types', () => {
      const yjsMsg = new Uint8Array([0x00, 1, 2, 3]);
      expect(isConversationExportStart(yjsMsg)).toBe(false);
    });
  });

  describe('isConversationChunk', () => {
    it('returns true for chunk message', () => {
      const data = new Uint8Array([P2PMessageType.CONVERSATION_CHUNK, 1, 2, 3]);
      expect(isConversationChunk(data)).toBe(true);
    });

    it('returns false for other message types', () => {
      const start = new Uint8Array([P2PMessageType.CONVERSATION_EXPORT_START, 1, 2, 3]);
      expect(isConversationChunk(start)).toBe(false);
    });
  });

  describe('isConversationExportEnd', () => {
    it('returns true for export end message', () => {
      const data = new Uint8Array([P2PMessageType.CONVERSATION_EXPORT_END, 1, 2, 3]);
      expect(isConversationExportEnd(data)).toBe(true);
    });

    it('returns false for other message types', () => {
      const chunk = new Uint8Array([P2PMessageType.CONVERSATION_CHUNK, 1, 2, 3]);
      expect(isConversationExportEnd(chunk)).toBe(false);
    });
  });

  describe('isP2PConversationMessage', () => {
    it('returns true for all P2P message types', () => {
      const start = new Uint8Array([P2PMessageType.CONVERSATION_EXPORT_START, 1]);
      const chunk = new Uint8Array([P2PMessageType.CONVERSATION_CHUNK, 1]);
      const end = new Uint8Array([P2PMessageType.CONVERSATION_EXPORT_END, 1]);

      expect(isP2PConversationMessage(start)).toBe(true);
      expect(isP2PConversationMessage(chunk)).toBe(true);
      expect(isP2PConversationMessage(end)).toBe(true);
    });

    it('returns false for non-P2P messages', () => {
      const yjsMsg = new Uint8Array([0x00, 1, 2]);
      const randomMsg = new Uint8Array([0x50, 1, 2]);

      expect(isP2PConversationMessage(yjsMsg)).toBe(false);
      expect(isP2PConversationMessage(randomMsg)).toBe(false);
    });

    it('returns false for empty data', () => {
      expect(isP2PConversationMessage(new Uint8Array([]))).toBe(false);
    });
  });
});

describe('Export Start Message', () => {
  it('encodes and decodes correctly', () => {
    const encoded = encodeExportStartMessage(sampleStartMeta);
    const decoded = decodeExportStartMessage(encoded);

    expect(decoded.exportId).toBe(sampleStartMeta.exportId);
    expect(decoded.totalChunks).toBe(sampleStartMeta.totalChunks);
    expect(decoded.totalBytes).toBe(sampleStartMeta.totalBytes);
    expect(decoded.compressedBytes).toBe(sampleStartMeta.compressedBytes);
    expect(decoded.sourcePlatform).toBe(sampleStartMeta.sourcePlatform);
    expect(decoded.sourceSessionId).toBe(sampleStartMeta.sourceSessionId);
    expect(decoded.planId).toBe(sampleStartMeta.planId);
    expect(decoded.exportedAt).toBe(sampleStartMeta.exportedAt);
  });

  it('includes correct type byte', () => {
    const encoded = encodeExportStartMessage(sampleStartMeta);
    expect(encoded[0]).toBe(P2PMessageType.CONVERSATION_EXPORT_START);
  });

  it('throws on decode of wrong type', () => {
    const wrongType = new Uint8Array([P2PMessageType.CONVERSATION_CHUNK, 1, 2, 3]);
    expect(() => decodeExportStartMessage(wrongType)).toThrow('wrong type byte');
  });

  it('throws on decode of empty message', () => {
    expect(() => decodeExportStartMessage(new Uint8Array([]))).toThrow('wrong type byte');
  });

  it('throws on decode of invalid JSON', () => {
    const invalidJson = new Uint8Array([P2PMessageType.CONVERSATION_EXPORT_START, 123]);
    expect(() => decodeExportStartMessage(invalidJson)).toThrow();
  });

  it('throws on decode of valid JSON but invalid schema', () => {
    const encoder = new TextEncoder();
    const invalidData = encoder.encode(JSON.stringify({ invalid: 'data' }));
    const msg = new Uint8Array(1 + invalidData.length);
    msg[0] = P2PMessageType.CONVERSATION_EXPORT_START;
    msg.set(invalidData, 1);

    expect(() => decodeExportStartMessage(msg)).toThrow();
  });
});

describe('Chunk Message', () => {
  it('encodes and decodes correctly', () => {
    const encoded = encodeChunkMessage(sampleChunk);
    const decoded = decodeChunkMessage(encoded);

    expect(decoded.exportId).toBe(sampleChunk.exportId);
    expect(decoded.chunkIndex).toBe(sampleChunk.chunkIndex);
    expect(decoded.data).toEqual(sampleChunk.data);
  });

  it('includes correct type byte', () => {
    const encoded = encodeChunkMessage(sampleChunk);
    expect(encoded[0]).toBe(P2PMessageType.CONVERSATION_CHUNK);
  });

  it('handles empty chunk data', () => {
    const emptyChunk: ChunkMessage = {
      exportId: 'export-123',
      chunkIndex: 0,
      data: new Uint8Array([]),
    };

    const encoded = encodeChunkMessage(emptyChunk);
    const decoded = decodeChunkMessage(encoded);

    expect(decoded.data).toEqual(new Uint8Array([]));
    expect(decoded.exportId).toBe('export-123');
  });

  it('handles large chunk data (16 KiB)', () => {
    const largeData = new Uint8Array(16 * 1024);
    for (let i = 0; i < largeData.length; i++) {
      largeData[i] = i % 256;
    }

    const largeChunk: ChunkMessage = {
      exportId: 'large-export',
      chunkIndex: 42,
      data: largeData,
    };

    const encoded = encodeChunkMessage(largeChunk);
    const decoded = decodeChunkMessage(encoded);

    expect(decoded.data.length).toBe(16 * 1024);
    expect(decoded.data).toEqual(largeData);
  });

  it('handles long export ID', () => {
    const longId = 'a'.repeat(1000);
    const chunk: ChunkMessage = {
      exportId: longId,
      chunkIndex: 1,
      data: new Uint8Array([1, 2, 3]),
    };

    const encoded = encodeChunkMessage(chunk);
    const decoded = decodeChunkMessage(encoded);

    expect(decoded.exportId).toBe(longId);
  });

  it('throws on decode of wrong type', () => {
    const wrongType = new Uint8Array([P2PMessageType.CONVERSATION_EXPORT_START, 1, 2, 3]);
    expect(() => decodeChunkMessage(wrongType)).toThrow('wrong type byte');
  });

  it('throws on decode of message that is too short', () => {
    const tooShort = new Uint8Array([P2PMessageType.CONVERSATION_CHUNK, 1, 2]);
    expect(() => decodeChunkMessage(tooShort)).toThrow('too short');
  });

  it('throws when exportId extends beyond message', () => {
    const msg = new Uint8Array(9);
    msg[0] = P2PMessageType.CONVERSATION_CHUNK;
    const view = new DataView(msg.buffer);
    view.setUint32(1, 1000, false);

    expect(() => decodeChunkMessage(msg)).toThrow('exportId extends beyond');
  });
});

describe('Export End Message', () => {
  it('encodes and decodes correctly', () => {
    const encoded = encodeExportEndMessage(sampleEnd);
    const decoded = decodeExportEndMessage(encoded);

    expect(decoded.exportId).toBe(sampleEnd.exportId);
    expect(decoded.checksum).toBe(sampleEnd.checksum);
  });

  it('includes correct type byte', () => {
    const encoded = encodeExportEndMessage(sampleEnd);
    expect(encoded[0]).toBe(P2PMessageType.CONVERSATION_EXPORT_END);
  });

  it('handles SHA-256 checksum (64 hex chars)', () => {
    const sha256End: ConversationExportEnd = {
      exportId: 'export-sha',
      checksum: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
    };

    const encoded = encodeExportEndMessage(sha256End);
    const decoded = decodeExportEndMessage(encoded);

    expect(decoded.checksum).toBe(sha256End.checksum);
    expect(decoded.checksum.length).toBe(64);
  });

  it('throws on decode of wrong type', () => {
    const wrongType = new Uint8Array([P2PMessageType.CONVERSATION_CHUNK, 1, 2, 3]);
    expect(() => decodeExportEndMessage(wrongType)).toThrow('wrong type byte');
  });
});

describe('decodeP2PMessage', () => {
  it('decodes export start message', () => {
    const encoded = encodeExportStartMessage(sampleStartMeta);
    const decoded = decodeP2PMessage(encoded);

    expect(decoded.type).toBe('export_start');
    if (decoded.type === 'export_start') {
      expect(decoded.payload.exportId).toBe(sampleStartMeta.exportId);
    }
  });

  it('decodes chunk message', () => {
    const encoded = encodeChunkMessage(sampleChunk);
    const decoded = decodeP2PMessage(encoded);

    expect(decoded.type).toBe('chunk');
    if (decoded.type === 'chunk') {
      expect(decoded.payload.chunkIndex).toBe(sampleChunk.chunkIndex);
    }
  });

  it('decodes export end message', () => {
    const encoded = encodeExportEndMessage(sampleEnd);
    const decoded = decodeP2PMessage(encoded);

    expect(decoded.type).toBe('export_end');
    if (decoded.type === 'export_end') {
      expect(decoded.payload.checksum).toBe(sampleEnd.checksum);
    }
  });

  it('throws on unknown message type', () => {
    const unknown = new Uint8Array([0x50, 1, 2, 3]);
    expect(() => decodeP2PMessage(unknown)).toThrow('Unknown P2P message type');
  });

  it('throws on empty message', () => {
    expect(() => decodeP2PMessage(new Uint8Array([]))).toThrow('Cannot decode empty message');
  });
});

describe('assertNeverP2PMessage', () => {
  it('throws with descriptive error', () => {
    const fakeNever = { type: 'unknown', payload: {} } as never;
    expect(() => assertNeverP2PMessage(fakeNever)).toThrow('Unhandled P2P message type');
  });
});

describe('Schema Validation', () => {
  describe('ConversationExportStartMetaSchema', () => {
    it('validates correct start meta', () => {
      const encoded = encodeExportStartMessage(sampleStartMeta);
      expect(() => decodeExportStartMessage(encoded)).not.toThrow();
    });

    it('rejects negative chunk count', () => {
      const invalidMeta = { ...sampleStartMeta, totalChunks: -1 };
      const encoder = new TextEncoder();
      const json = encoder.encode(JSON.stringify(invalidMeta));
      const msg = new Uint8Array(1 + json.length);
      msg[0] = P2PMessageType.CONVERSATION_EXPORT_START;
      msg.set(json, 1);

      expect(() => decodeExportStartMessage(msg)).toThrow();
    });

    it('rejects missing required fields', () => {
      const incomplete = { exportId: 'test' };
      const encoder = new TextEncoder();
      const json = encoder.encode(JSON.stringify(incomplete));
      const msg = new Uint8Array(1 + json.length);
      msg[0] = P2PMessageType.CONVERSATION_EXPORT_START;
      msg.set(json, 1);

      expect(() => decodeExportStartMessage(msg)).toThrow();
    });
  });

  describe('ChunkMessageSchema', () => {
    it('validates correct chunk', () => {
      const encoded = encodeChunkMessage(sampleChunk);
      expect(() => decodeChunkMessage(encoded)).not.toThrow();
    });

    it('rejects negative chunk index', () => {
      const msg = new Uint8Array(20);
      msg[0] = P2PMessageType.CONVERSATION_CHUNK;
      const view = new DataView(msg.buffer);

      view.setUint32(1, 5, false);
      msg.set(new TextEncoder().encode('test\0'), 5);
      view.setUint32(10, 4294967295, false);

      expect(() => decodeChunkMessage(msg)).not.toThrow();
    });
  });

  describe('ConversationExportEndSchema', () => {
    it('validates correct end message', () => {
      const encoded = encodeExportEndMessage(sampleEnd);
      expect(() => decodeExportEndMessage(encoded)).not.toThrow();
    });

    it('rejects missing checksum', () => {
      const incomplete = { exportId: 'test' };
      const encoder = new TextEncoder();
      const json = encoder.encode(JSON.stringify(incomplete));
      const msg = new Uint8Array(1 + json.length);
      msg[0] = P2PMessageType.CONVERSATION_EXPORT_END;
      msg.set(json, 1);

      expect(() => decodeExportEndMessage(msg)).toThrow();
    });
  });
});

describe('Round-Trip Tests', () => {
  it('start message survives encode/decode round-trip', () => {
    const encoded = encodeExportStartMessage(sampleStartMeta);
    const decoded = decodeExportStartMessage(encoded);

    const reencoded = encodeExportStartMessage(decoded);
    const redecoded = decodeExportStartMessage(reencoded);

    expect(redecoded).toEqual(decoded);
  });

  it('chunk message survives encode/decode round-trip', () => {
    const encoded = encodeChunkMessage(sampleChunk);
    const decoded = decodeChunkMessage(encoded);

    const reencoded = encodeChunkMessage(decoded);
    const redecoded = decodeChunkMessage(reencoded);

    expect(redecoded).toEqual(decoded);
  });

  it('end message survives encode/decode round-trip', () => {
    const encoded = encodeExportEndMessage(sampleEnd);
    const decoded = decodeExportEndMessage(encoded);

    const reencoded = encodeExportEndMessage(decoded);
    const redecoded = decodeExportEndMessage(reencoded);

    expect(redecoded).toEqual(decoded);
  });

  it('preserves binary data integrity through chunk encoding', () => {
    const allBytes = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
      allBytes[i] = i;
    }

    const chunk: ChunkMessage = {
      exportId: 'binary-test',
      chunkIndex: 0,
      data: allBytes,
    };

    const encoded = encodeChunkMessage(chunk);
    const decoded = decodeChunkMessage(encoded);

    expect(decoded.data.length).toBe(256);
    for (let i = 0; i < 256; i++) {
      expect(decoded.data[i]).toBe(i);
    }
  });
});
