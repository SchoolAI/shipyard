/**
 * P2P Message Protocol for Context Teleportation
 *
 * This module defines the message types and schemas for peer-to-peer
 * conversation transfer over WebRTC data channels.
 *
 * Message type bytes are chosen to not conflict with Yjs protocol:
 * - Yjs uses 0x00-0x04 for its internal messages
 * - We use 0xF0-0xF2 for conversation transfer
 *
 * @see Issue #41 - Context Teleportation
 * @see docs/designs/webrtc-custom-messages-research.md
 */

import { z } from 'zod';

// =============================================================================
// P2P Message Type Constants
// =============================================================================

/**
 * P2P message type bytes.
 * These are carefully chosen to avoid conflicts with Yjs protocol (0x00-0x04).
 */
export const P2PMessageType = {
  CONVERSATION_EXPORT_START: 0xf0,
  CONVERSATION_CHUNK: 0xf1,
  CONVERSATION_EXPORT_END: 0xf2,
} as const;

export type P2PMessageTypeValue = (typeof P2PMessageType)[keyof typeof P2PMessageType];

// =============================================================================
// Message Schemas
// =============================================================================

/**
 * Metadata sent at the start of a conversation export transfer.
 * Contains all information needed to reassemble the conversation.
 */
export const ConversationExportStartMetaSchema = z.object({
  /** Unique ID for this transfer (used to match chunks) */
  exportId: z.string(),
  /** Total number of chunks to expect */
  totalChunks: z.number().int().positive(),
  /** Total size in bytes (uncompressed) */
  totalBytes: z.number().int().nonnegative(),
  /** Compressed size in bytes */
  compressedBytes: z.number().int().nonnegative(),
  /** Source platform (e.g., 'claude-code', 'devin', 'cursor') */
  sourcePlatform: z.string(),
  /** Session ID from the source platform */
  sourceSessionId: z.string(),
  /** Plan ID this conversation belongs to */
  planId: z.string(),
  /** Timestamp when export was initiated (Unix ms) */
  exportedAt: z.number().int().positive(),
});
export type ConversationExportStartMeta = z.infer<typeof ConversationExportStartMetaSchema>;

/**
 * A single chunk of conversation data.
 */
export const ChunkMessageSchema = z.object({
  /** Export ID this chunk belongs to */
  exportId: z.string(),
  /** Zero-based index of this chunk */
  chunkIndex: z.number().int().nonnegative(),
  /** Raw chunk data (compressed bytes) */
  data: z.instanceof(Uint8Array),
});
export type ChunkMessage = z.infer<typeof ChunkMessageSchema>;

/**
 * End message sent after all chunks, contains checksum for verification.
 */
export const ConversationExportEndSchema = z.object({
  /** Export ID this end message belongs to */
  exportId: z.string(),
  /** SHA-256 checksum of the full compressed data (hex string) */
  checksum: z.string(),
});
export type ConversationExportEnd = z.infer<typeof ConversationExportEndSchema>;

// =============================================================================
// Type Guards (for discriminating our messages from Yjs messages)
// =============================================================================

/**
 * Checks if a Uint8Array is a P2P conversation export start message.
 */
export function isConversationExportStart(data: Uint8Array): boolean {
  return data.length > 0 && data[0] === P2PMessageType.CONVERSATION_EXPORT_START;
}

/**
 * Checks if a Uint8Array is a P2P conversation chunk message.
 */
export function isConversationChunk(data: Uint8Array): boolean {
  return data.length > 0 && data[0] === P2PMessageType.CONVERSATION_CHUNK;
}

/**
 * Checks if a Uint8Array is a P2P conversation export end message.
 */
export function isConversationExportEnd(data: Uint8Array): boolean {
  return data.length > 0 && data[0] === P2PMessageType.CONVERSATION_EXPORT_END;
}

/**
 * Checks if a Uint8Array is any P2P conversation transfer message.
 */
export function isP2PConversationMessage(data: Uint8Array): boolean {
  if (data.length === 0) return false;
  const type = data[0];
  return (
    type === P2PMessageType.CONVERSATION_EXPORT_START ||
    type === P2PMessageType.CONVERSATION_CHUNK ||
    type === P2PMessageType.CONVERSATION_EXPORT_END
  );
}

// =============================================================================
// Message Encoding/Decoding
// =============================================================================

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

/**
 * Encodes a conversation export start message.
 * Format: [type byte (1)] [JSON metadata]
 */
export function encodeExportStartMessage(meta: ConversationExportStartMeta): Uint8Array {
  const jsonBytes = textEncoder.encode(JSON.stringify(meta));
  const result = new Uint8Array(1 + jsonBytes.length);
  result[0] = P2PMessageType.CONVERSATION_EXPORT_START;
  result.set(jsonBytes, 1);
  return result;
}

/**
 * Decodes a conversation export start message.
 * @throws {Error} If the message is malformed or validation fails
 */
export function decodeExportStartMessage(data: Uint8Array): ConversationExportStartMeta {
  if (data.length === 0 || data[0] !== P2PMessageType.CONVERSATION_EXPORT_START) {
    throw new Error('Invalid export start message: wrong type byte');
  }
  const jsonStr = textDecoder.decode(data.slice(1));
  const parsed: unknown = JSON.parse(jsonStr);
  return ConversationExportStartMetaSchema.parse(parsed);
}

/**
 * Encodes a chunk message.
 * Format: [type byte (1)] [exportId length (4)] [exportId] [chunkIndex (4)] [data]
 */
export function encodeChunkMessage(chunk: ChunkMessage): Uint8Array {
  const exportIdBytes = textEncoder.encode(chunk.exportId);
  // 1 (type) + 4 (exportId length) + exportIdBytes.length + 4 (chunkIndex) + data.length
  const result = new Uint8Array(1 + 4 + exportIdBytes.length + 4 + chunk.data.length);
  let offset = 0;

  // Type byte
  result[offset] = P2PMessageType.CONVERSATION_CHUNK;
  offset += 1;

  // Export ID length (4 bytes, big-endian)
  const view = new DataView(result.buffer);
  view.setUint32(offset, exportIdBytes.length, false);
  offset += 4;

  // Export ID
  result.set(exportIdBytes, offset);
  offset += exportIdBytes.length;

  // Chunk index (4 bytes, big-endian)
  view.setUint32(offset, chunk.chunkIndex, false);
  offset += 4;

  // Data
  result.set(chunk.data, offset);

  return result;
}

/**
 * Decodes a chunk message.
 * @throws {Error} If the message is malformed
 */
export function decodeChunkMessage(data: Uint8Array): ChunkMessage {
  if (data.length < 9 || data[0] !== P2PMessageType.CONVERSATION_CHUNK) {
    throw new Error('Invalid chunk message: too short or wrong type byte');
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let offset = 1;

  // Export ID length
  const exportIdLength = view.getUint32(offset, false);
  offset += 4;

  if (data.length < 9 + exportIdLength) {
    throw new Error('Invalid chunk message: exportId extends beyond message');
  }

  // Export ID
  const exportId = textDecoder.decode(data.slice(offset, offset + exportIdLength));
  offset += exportIdLength;

  // Chunk index
  const chunkIndex = view.getUint32(offset, false);
  offset += 4;

  // Data
  const chunkData = data.slice(offset);

  return ChunkMessageSchema.parse({
    exportId,
    chunkIndex,
    data: chunkData,
  });
}

/**
 * Encodes a conversation export end message.
 * Format: [type byte (1)] [JSON payload]
 */
export function encodeExportEndMessage(end: ConversationExportEnd): Uint8Array {
  const jsonBytes = textEncoder.encode(JSON.stringify(end));
  const result = new Uint8Array(1 + jsonBytes.length);
  result[0] = P2PMessageType.CONVERSATION_EXPORT_END;
  result.set(jsonBytes, 1);
  return result;
}

/**
 * Decodes a conversation export end message.
 * @throws {Error} If the message is malformed or validation fails
 */
export function decodeExportEndMessage(data: Uint8Array): ConversationExportEnd {
  if (data.length === 0 || data[0] !== P2PMessageType.CONVERSATION_EXPORT_END) {
    throw new Error('Invalid export end message: wrong type byte');
  }
  const jsonStr = textDecoder.decode(data.slice(1));
  const parsed: unknown = JSON.parse(jsonStr);
  return ConversationExportEndSchema.parse(parsed);
}

// =============================================================================
// Discriminated Union Types for Type-Safe Message Handling
// =============================================================================

/**
 * Decoded P2P message with discriminated union type.
 */
export type DecodedP2PMessage =
  | { type: 'export_start'; payload: ConversationExportStartMeta }
  | { type: 'chunk'; payload: ChunkMessage }
  | { type: 'export_end'; payload: ConversationExportEnd };

/**
 * Decodes any P2P conversation message into a discriminated union.
 * @throws {Error} If the message is not a valid P2P message
 */
export function decodeP2PMessage(data: Uint8Array): DecodedP2PMessage {
  if (data.length === 0) {
    throw new Error('Cannot decode empty message');
  }

  const type = data[0];
  if (type === undefined) {
    throw new Error('Message type byte is missing');
  }

  switch (type) {
    case P2PMessageType.CONVERSATION_EXPORT_START:
      return { type: 'export_start', payload: decodeExportStartMessage(data) };
    case P2PMessageType.CONVERSATION_CHUNK:
      return { type: 'chunk', payload: decodeChunkMessage(data) };
    case P2PMessageType.CONVERSATION_EXPORT_END:
      return { type: 'export_end', payload: decodeExportEndMessage(data) };
    default:
      throw new Error(`Unknown P2P message type: 0x${type.toString(16)}`);
  }
}

/**
 * Helper to ensure exhaustive handling of decoded messages.
 */
export function assertNeverP2PMessage(msg: never): never {
  throw new Error(`Unhandled P2P message type: ${JSON.stringify(msg)}`);
}
