/**
 * ConversationTransferManager - P2P transfer of A2A conversations
 *
 * This class handles chunked transfer of compressed conversation data
 * over WebRTC data channels. It's designed to work with y-webrtc but
 * receives peer connections as a parameter to maintain encapsulation.
 *
 * Key features:
 * - 16 KiB chunks for cross-browser compatibility
 * - Backpressure handling (checks bufferedAmount before sending)
 * - SHA-256 checksum verification
 * - Progress callbacks for UI feedback
 * - Proper cleanup and cancellation support
 *
 * @see Issue #41 - Context Teleportation
 * @see docs/designs/webrtc-custom-messages-research.md
 */

import type { A2AMessage, ConversationExportMeta } from '@shipyard/schema';
import {
  assertNeverP2PMessage,
  type ChunkMessage,
  type ConversationExportEnd,
  type ConversationExportStartMeta,
  type DecodedP2PMessage,
  decodeP2PMessage,
  encodeChunkMessage,
  encodeExportEndMessage,
  encodeExportStartMessage,
  isP2PConversationMessage,
  validateA2AMessages,
} from '@shipyard/schema';
import lzstring from 'lz-string';

// =============================================================================
// Constants
// =============================================================================

/** Chunk size in bytes - 16 KiB for maximum cross-browser compatibility */
const CHUNK_SIZE = 16 * 1024;

/** Buffer threshold before applying backpressure (1 MB) */
const BACKPRESSURE_THRESHOLD = 1024 * 1024;

/** Delay in ms when waiting for buffer to drain */
const BACKPRESSURE_DELAY = 100;

/** Transfer timeout in ms (5 minutes) */
const TRANSFER_TIMEOUT = 5 * 60 * 1000;

/** Progress check interval for timeout detection */
const PROGRESS_CHECK_INTERVAL = 30 * 1000;

// =============================================================================
// Types
// =============================================================================

/**
 * Minimal interface for peer connections.
 * This allows us to accept simple-peer instances without depending on the library directly.
 */
export interface PeerConnection {
  /** Whether the peer is connected */
  connected: boolean;
  /** Amount of data buffered but not yet sent */
  bufferedAmount: number;
  /** Send binary data to the peer */
  send(data: Uint8Array): void;
  /** Listen for data events */
  on(event: 'data', callback: (data: Uint8Array) => void): void;
  /** Listen for close events */
  on(event: 'close', callback: () => void): void;
  /** Listen for error events */
  on(event: 'error', callback: (error: Error) => void): void;
  /** Remove event listeners - overloads match on() signature for type safety */
  removeListener(event: 'data', callback: (data: Uint8Array) => void): void;
  removeListener(event: 'close', callback: () => void): void;
  removeListener(event: 'error', callback: (error: Error) => void): void;
}

/**
 * Options for sending a conversation.
 */
export interface SendOptions {
  /** Called with (sentChunks, totalChunks) during transfer */
  onProgress?: (sent: number, total: number) => void;
  /** Called when transfer completes successfully */
  onComplete?: () => void;
  /** Called if transfer fails */
  onError?: (error: Error) => void;
}

/**
 * Callback signature for received conversations.
 */
export type ConversationReceivedCallback = (
  messages: A2AMessage[],
  meta: ConversationExportMeta
) => void;

/**
 * Internal state for tracking incoming transfers.
 */
interface IncomingTransfer {
  meta: ConversationExportStartMeta;
  chunks: Map<number, Uint8Array>;
  receivedChunks: number;
  lastProgressAt: number;
}

/**
 * Internal state for tracking outgoing transfers.
 */
interface OutgoingTransfer {
  exportId: string;
  peerId: string;
  cancelled: boolean;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Generates a UUID for transfer identification.
 */
function generateExportId(): string {
  return crypto.randomUUID();
}

/**
 * Computes SHA-256 hash of data and returns hex string.
 */
async function computeChecksum(data: Uint8Array): Promise<string> {
  /**
   * Web Crypto API expects BufferSource (ArrayBuffer | ArrayBufferView).
   * Uint8Array<ArrayBufferLike> includes SharedArrayBuffer which isn't accepted.
   * Using the underlying ArrayBuffer directly works around this TypeScript limitation.
   */
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- Uint8Array.buffer is ArrayBuffer but TypeScript readonly/mutable incompatibility
  const buffer = data.buffer as ArrayBuffer;
  const hashBuffer = await crypto.subtle.digest('SHA-256', new Uint8Array(buffer, data.byteOffset, data.byteLength));
  const hashArray = new Uint8Array(hashBuffer);
  return Array.from(hashArray)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Sleep for a given number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Compresses JSON data to Uint8Array using lz-string.
 */
function compressToUint8Array(json: string): Uint8Array {
  const compressed = lzstring.compressToUint8Array(json);
  return compressed;
}

/**
 * Decompresses Uint8Array back to JSON string using lz-string.
 */
function decompressFromUint8Array(data: Uint8Array): string | null {
  return lzstring.decompressFromUint8Array(data);
}

// =============================================================================
// ConversationTransferManager Class
// =============================================================================

/**
 * Manages P2P transfer of A2A conversation exports.
 *
 * Usage:
 * ```typescript
 * const manager = new ConversationTransferManager(peers);
 *
 * // Send a conversation
 * await manager.sendConversation('peer-123', messages, {
 *   exportId: '...',
 *   planId: 'plan-abc',
 *   // ... other metadata
 * }, {
 *   onProgress: (sent, total) => console.log(`${sent}/${total}`),
 * });
 *
 * // Receive conversations
 * const cleanup = manager.onReceiveConversation((messages, meta) => {
 *   console.log('Received conversation:', meta.planId);
 * });
 *
 * // Later: cleanup
 * cleanup();
 * ```
 */
export class ConversationTransferManager {
  private readonly peers: Map<string, PeerConnection>;
  private readonly incomingTransfers = new Map<string, IncomingTransfer>();
  private readonly outgoingTransfers = new Map<string, OutgoingTransfer>();
  private readonly receiveCallbacks = new Set<ConversationReceivedCallback>();
  private readonly peerListeners = new Map<
    string,
    { data: (d: Uint8Array) => void; close: () => void }
  >();
  private disposed = false;

  /**
   * Creates a new ConversationTransferManager.
   *
   * @param peers - Map of peer IDs to peer connections
   */
  constructor(peers: Map<string, PeerConnection>) {
    this.peers = peers;
    this.setupPeerListeners();
  }

  /**
   * Sets up data listeners on all connected peers.
   */
  private setupPeerListeners(): void {
    for (const [peerId, peer] of this.peers) {
      this.addPeerListener(peerId, peer);
    }
  }

  /**
   * Adds a data listener to a single peer.
   */
  private addPeerListener(peerId: string, peer: PeerConnection): void {
    const dataHandler = (data: Uint8Array): void => {
      if (this.disposed) return;
      if (isP2PConversationMessage(data)) {
        this.handleIncomingMessage(peerId, data);
      }
      // Non-P2P messages are ignored (let Yjs handle them)
    };

    const closeHandler = (): void => {
      if (this.disposed) return;
      this.handlePeerClose(peerId);
    };

    peer.on('data', dataHandler);
    peer.on('close', closeHandler);

    this.peerListeners.set(peerId, { data: dataHandler, close: closeHandler });
  }

  /**
   * Handles incoming P2P messages from a peer.
   */
  private handleIncomingMessage(peerId: string, data: Uint8Array): void {
    let decoded: DecodedP2PMessage;
    try {
      decoded = decodeP2PMessage(data);
    } catch (_err) {
      return;
    }

    switch (decoded.type) {
      case 'export_start':
        this.handleExportStart(peerId, decoded.payload);
        break;
      case 'chunk':
        this.handleChunk(peerId, decoded.payload);
        break;
      case 'export_end':
        this.handleExportEnd(peerId, decoded.payload);
        break;
      default:
        assertNeverP2PMessage(decoded);
    }
  }

  /**
   * Handles export start message.
   */
  private handleExportStart(_peerId: string, meta: ConversationExportStartMeta): void {
    // Start tracking this transfer
    this.incomingTransfers.set(meta.exportId, {
      meta,
      chunks: new Map(),
      receivedChunks: 0,
      lastProgressAt: Date.now(),
    });

    // Set up timeout checker
    this.scheduleTimeoutCheck(meta.exportId);
  }

  /**
   * Handles chunk message.
   */
  private handleChunk(_peerId: string, chunk: ChunkMessage): void {
    const transfer = this.incomingTransfers.get(chunk.exportId);
    if (!transfer) {
      return;
    }

    // Store chunk
    transfer.chunks.set(chunk.chunkIndex, chunk.data);
    transfer.receivedChunks = transfer.chunks.size;
    transfer.lastProgressAt = Date.now();
  }

  /**
   * Handles export end message - reassembles and validates.
   */
  private async handleExportEnd(_peerId: string, end: ConversationExportEnd): Promise<void> {
    const transfer = this.incomingTransfers.get(end.exportId);
    if (!transfer) {
      return;
    }

    // Check we have all chunks
    if (transfer.chunks.size !== transfer.meta.totalChunks) {
      this.incomingTransfers.delete(end.exportId);
      return;
    }

    // Reassemble chunks in order
    const assembledSize = transfer.meta.compressedBytes;
    const assembled = new Uint8Array(assembledSize);
    let offset = 0;

    for (let i = 0; i < transfer.meta.totalChunks; i++) {
      const chunk = transfer.chunks.get(i);
      if (!chunk) {
        this.incomingTransfers.delete(end.exportId);
        return;
      }
      assembled.set(chunk, offset);
      offset += chunk.length;
    }

    // Verify checksum
    const actualChecksum = await computeChecksum(assembled);
    if (actualChecksum !== end.checksum) {
      this.incomingTransfers.delete(end.exportId);
      return;
    }

    // Decompress
    const json = decompressFromUint8Array(assembled);
    if (!json) {
      this.incomingTransfers.delete(end.exportId);
      return;
    }

    // Parse and validate messages
    let messages: A2AMessage[];
    try {
      const parsed: unknown = JSON.parse(json);
      if (!Array.isArray(parsed)) {
        this.incomingTransfers.delete(end.exportId);
        return;
      }
      const { valid, errors } = validateA2AMessages(parsed);
      if (errors.length > 0) {
        this.incomingTransfers.delete(end.exportId);
        return;
      }
      messages = valid;
    } catch (_err) {
      this.incomingTransfers.delete(end.exportId);
      return;
    }

    // Clean up
    this.incomingTransfers.delete(end.exportId);

    // Convert start meta to export meta format
    const exportMeta: ConversationExportMeta = {
      exportId: transfer.meta.exportId,
      sourcePlatform: transfer.meta.sourcePlatform,
      sourceSessionId: transfer.meta.sourceSessionId,
      planId: transfer.meta.planId,
      exportedAt: transfer.meta.exportedAt,
      messageCount: messages.length,
      compressedBytes: transfer.meta.compressedBytes,
      uncompressedBytes: transfer.meta.totalBytes,
    };

    // Notify callbacks
    for (const callback of this.receiveCallbacks) {
      try {
        callback(messages, exportMeta);
      } catch (_err) {}
    }
  }

  /**
   * Handles peer disconnect.
   */
  private handlePeerClose(peerId: string): void {
    // Cancel any outgoing transfers to this peer
    for (const [exportId, transfer] of this.outgoingTransfers) {
      if (transfer.peerId === peerId) {
        transfer.cancelled = true;
        this.outgoingTransfers.delete(exportId);
      }
    }

    // Remove listener
    this.peerListeners.delete(peerId);
  }

  /**
   * Schedules a timeout check for an incoming transfer.
   */
  private scheduleTimeoutCheck(exportId: string): void {
    setTimeout(() => {
      const transfer = this.incomingTransfers.get(exportId);
      if (!transfer) return; // Already completed

      const timeSinceProgress = Date.now() - transfer.lastProgressAt;
      if (timeSinceProgress > TRANSFER_TIMEOUT) {
        this.incomingTransfers.delete(exportId);
      } else {
        // Schedule another check
        this.scheduleTimeoutCheck(exportId);
      }
    }, PROGRESS_CHECK_INTERVAL);
  }

  /**
   * Sends a conversation to a specific peer.
   *
   * @param peerId - ID of the peer to send to
   * @param messages - A2A messages to send
   * @param metadata - Export metadata (without exportId - we generate it)
   * @param options - Progress and completion callbacks
   */
  async sendConversation(
    peerId: string,
    messages: A2AMessage[],
    metadata: Omit<
      ConversationExportStartMeta,
      'exportId' | 'totalChunks' | 'totalBytes' | 'compressedBytes'
    >,
    options: SendOptions = {}
  ): Promise<void> {
    const peer = this.peers.get(peerId);
    if (!peer) {
      const error = new Error(`Peer ${peerId} not found`);
      options.onError?.(error);
      throw error;
    }

    if (!peer.connected) {
      const error = new Error(`Peer ${peerId} not connected`);
      options.onError?.(error);
      throw error;
    }

    const exportId = generateExportId();

    // Track outgoing transfer
    const transferState: OutgoingTransfer = {
      exportId,
      peerId,
      cancelled: false,
    };
    this.outgoingTransfers.set(exportId, transferState);

    try {
      // Serialize and compress
      const json = JSON.stringify(messages);
      const compressed = compressToUint8Array(json);

      // Calculate chunks
      const totalChunks = Math.ceil(compressed.length / CHUNK_SIZE);

      // Build start metadata
      const startMeta: ConversationExportStartMeta = {
        exportId,
        totalChunks,
        totalBytes: json.length,
        compressedBytes: compressed.length,
        sourcePlatform: metadata.sourcePlatform,
        sourceSessionId: metadata.sourceSessionId,
        planId: metadata.planId,
        exportedAt: metadata.exportedAt,
      };

      // Send start message
      const startMsg = encodeExportStartMessage(startMeta);
      await this.sendWithBackpressure(peer, startMsg, transferState);

      // Send chunks
      for (let i = 0; i < totalChunks; i++) {
        if (transferState.cancelled) {
          throw new Error('Transfer cancelled');
        }

        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, compressed.length);
        const chunkData = compressed.slice(start, end);

        const chunk: ChunkMessage = {
          exportId,
          chunkIndex: i,
          data: chunkData,
        };

        const chunkMsg = encodeChunkMessage(chunk);
        await this.sendWithBackpressure(peer, chunkMsg, transferState);

        // Progress callback
        options.onProgress?.(i + 1, totalChunks);
      }

      // Compute checksum
      const checksum = await computeChecksum(compressed);

      // Send end message
      const endPayload: ConversationExportEnd = {
        exportId,
        checksum,
      };
      const endMsg = encodeExportEndMessage(endPayload);
      await this.sendWithBackpressure(peer, endMsg, transferState);

      // Clean up and notify
      this.outgoingTransfers.delete(exportId);
      options.onComplete?.();
    } catch (err) {
      this.outgoingTransfers.delete(exportId);
      const error = err instanceof Error ? err : new Error(String(err));
      options.onError?.(error);
      throw error;
    }
  }

  /**
   * Sends data with backpressure handling.
   */
  private async sendWithBackpressure(
    peer: PeerConnection,
    data: Uint8Array,
    transfer: OutgoingTransfer
  ): Promise<void> {
    // Wait for buffer to drain if needed
    while (peer.bufferedAmount > BACKPRESSURE_THRESHOLD) {
      if (transfer.cancelled) {
        throw new Error('Transfer cancelled');
      }
      if (!peer.connected) {
        throw new Error('Peer disconnected during transfer');
      }
      await sleep(BACKPRESSURE_DELAY);
    }

    if (!peer.connected) {
      throw new Error('Peer disconnected during transfer');
    }

    peer.send(data);
  }

  /**
   * Registers a callback for received conversations.
   *
   * @param callback - Function to call when a conversation is received
   * @returns Cleanup function to unregister the callback
   */
  onReceiveConversation(callback: ConversationReceivedCallback): () => void {
    this.receiveCallbacks.add(callback);
    return () => {
      this.receiveCallbacks.delete(callback);
    };
  }

  /**
   * Cancels an in-progress outgoing transfer.
   *
   * @param exportId - ID of the transfer to cancel
   */
  cancelTransfer(exportId: string): void {
    const transfer = this.outgoingTransfers.get(exportId);
    if (transfer) {
      transfer.cancelled = true;
    }
    // Also clean up incoming transfers if cancelled
    this.incomingTransfers.delete(exportId);
  }

  /**
   * Adds a new peer to track.
   * Call this when new peers connect.
   */
  addPeer(peerId: string, peer: PeerConnection): void {
    if (this.disposed) return;
    this.peers.set(peerId, peer);
    this.addPeerListener(peerId, peer);
  }

  /**
   * Removes a peer from tracking.
   * Call this when peers disconnect.
   */
  removePeer(peerId: string): void {
    const peer = this.peers.get(peerId);
    const listeners = this.peerListeners.get(peerId);

    if (peer && listeners) {
      peer.removeListener('data', listeners.data);
      peer.removeListener('close', listeners.close);
    }

    this.peers.delete(peerId);
    this.peerListeners.delete(peerId);
    this.handlePeerClose(peerId);
  }

  /**
   * Gets the list of connected peer IDs.
   */
  getConnectedPeerIds(): string[] {
    return Array.from(this.peers.entries())
      .filter(([_, peer]) => peer.connected)
      .map(([id]) => id);
  }

  /**
   * Cleans up all resources.
   * Call this when the manager is no longer needed.
   */
  dispose(): void {
    this.disposed = true;

    // Remove all listeners
    for (const [peerId, peer] of this.peers) {
      const listeners = this.peerListeners.get(peerId);
      if (listeners) {
        peer.removeListener('data', listeners.data);
        peer.removeListener('close', listeners.close);
      }
    }

    this.peerListeners.clear();
    this.receiveCallbacks.clear();
    this.incomingTransfers.clear();
    this.outgoingTransfers.clear();
  }
}

// =============================================================================
// Exports for Testing
// =============================================================================

export const _testing = {
  CHUNK_SIZE,
  BACKPRESSURE_THRESHOLD,
  BACKPRESSURE_DELAY,
  computeChecksum,
  compressToUint8Array,
  decompressFromUint8Array,
};
