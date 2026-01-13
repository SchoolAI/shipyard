/**
 * useConversationTransfer - React hook for P2P conversation transfers
 *
 * This hook provides both P2P transfer (via WebRTC) and file-based transfer
 * capabilities for A2A conversation exports.
 *
 * Features:
 * - P2P transfer to connected peers with progress tracking
 * - File-based export/import as fallback
 * - Automatic peer discovery from y-webrtc provider
 *
 * @see Issue #41 - Context Teleportation
 */

import {
  type A2AMessage,
  type ConversationExportMeta,
  claudeCodeToA2A,
  parseClaudeCodeTranscriptString,
  summarizeA2AConversation,
  validateA2AMessages,
} from '@peer-plan/schema';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { WebrtcProvider } from 'y-webrtc';
import type * as Y from 'yjs';
import { z } from 'zod';
import {
  ConversationTransferManager,
  type PeerConnection,
  type SendOptions,
} from '../utils/ConversationTransferManager';

// =============================================================================
// Types
// =============================================================================

/**
 * Internal types for accessing y-webrtc internals.
 * These are not exported by y-webrtc, so we define minimal interfaces.
 */
interface WebrtcConn {
  peer: PeerConnection;
}

interface WebrtcRoom {
  webrtcConns: Map<string, WebrtcConn>;
}

interface WebrtcProviderInternal {
  room: WebrtcRoom | null;
}

/**
 * Progress callback for transfer operations.
 */
export interface TransferProgress {
  /** Unique ID for this transfer */
  exportId?: string;
  /** Direction of transfer */
  direction?: 'sending' | 'receiving';
  /** Target peer ID (for P2P) */
  peerId?: string;
  /** Current chunk being processed */
  current: number;
  /** Total chunks */
  total: number;
  /** Transfer stage */
  stage: 'preparing' | 'compressing' | 'transferring' | 'done';
  /** Progress percentage (0-100) */
  percentage?: number;
}

/**
 * Schema for imported conversation files.
 */
const ImportedConversationSchema = z.object({
  meta: z.object({
    exportId: z.string(),
    sourcePlatform: z.string(),
    sourceSessionId: z.string(),
    planId: z.string(),
    exportedAt: z.number(),
    messageCount: z.number(),
    compressedBytes: z.number().optional(),
    uncompressedBytes: z.number().optional(),
  }),
  messages: z.array(z.unknown()),
});

/**
 * Result of an export operation.
 */
export interface ExportResult {
  success: boolean;
  filename?: string;
  messageCount?: number;
  error?: string;
}

/**
 * Result of an import operation.
 */
export interface ImportResult {
  success: boolean;
  messages?: A2AMessage[];
  meta?: ConversationExportMeta;
  summary?: { title: string; text: string };
  error?: string;
}

/**
 * Received conversation from P2P transfer.
 */
export interface ReceivedConversation {
  messages: A2AMessage[];
  meta: ConversationExportMeta;
  summary: { title: string; text: string };
  receivedAt: number;
}

/**
 * Result type for the hook.
 */
interface UseConversationTransferResult {
  /** Export conversation to file download */
  exportToFile: (transcript: string) => Promise<ExportResult>;
  /** Import conversation from file */
  importFromFile: (file: File) => Promise<ImportResult>;
  /** Send conversation to P2P peer */
  sendToPeer: (peerId: string, messages: A2AMessage[], options?: SendOptions) => Promise<boolean>;
  /** Cancel an in-progress transfer */
  cancelTransfer: (exportId: string) => void;
  /** Conversations received from P2P peers */
  receivedConversations: ReceivedConversation[];
  /** Clear received conversations */
  clearReceived: () => void;
  /** Current export/import/transfer progress */
  progress: TransferProgress | null;
  /** Whether an operation is in progress */
  isProcessing: boolean;
  /** List of connected peer IDs that can receive transfers */
  connectedPeerIds: string[];
  /** Whether P2P transfer is available (has connected peers) */
  isP2PAvailable: boolean;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Extracts peer connections from a WebRTC provider.
 * This accesses internal y-webrtc state (not part of public API).
 */
function extractPeersFromProvider(provider: WebrtcProvider | null): Map<string, PeerConnection> {
  const peers = new Map<string, PeerConnection>();

  if (!provider) return peers;

  // Access internal room structure (undocumented API)
  const internal = provider as unknown as WebrtcProviderInternal;
  const room = internal.room;

  if (!room || !room.webrtcConns) return peers;

  // Extract peer connections
  for (const [peerId, conn] of room.webrtcConns) {
    if (conn.peer) {
      peers.set(peerId, conn.peer);
    }
  }

  return peers;
}

// =============================================================================
// Hook Implementation
// =============================================================================

/**
 * Hook for managing conversation export/import and P2P transfer.
 *
 * @param planId - Current plan ID (used in export metadata)
 * @param ydoc - Y.Doc for accessing plan metadata
 * @param rtcProvider - Optional WebRTC provider for P2P transfers
 */
export function useConversationTransfer(
  planId: string,
  ydoc: Y.Doc,
  rtcProvider: WebrtcProvider | null
): UseConversationTransferResult {
  const [progress, setProgress] = useState<TransferProgress | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [receivedConversations, setReceivedConversations] = useState<ReceivedConversation[]>([]);
  const [connectedPeerIds, setConnectedPeerIds] = useState<string[]>([]);

  // Manager ref for P2P transfers
  const managerRef = useRef<ConversationTransferManager | null>(null);
  // Track peers we've added to the manager
  const trackedPeersRef = useRef<Map<string, PeerConnection>>(new Map());
  // Track last peer count to detect changes
  const lastPeerCountRef = useRef(0);

  /**
   * Get plan metadata for export.
   * Type-safe extraction of origin metadata using discriminated union.
   */
  const getPlanMetadata = useCallback(() => {
    const metadataMap = ydoc.getMap('metadata');
    const origin = metadataMap.get('origin') as any;
    return {
      origin,
    };
  }, [ydoc]);

  // Initialize and manage P2P transfer manager
  useEffect(() => {
    if (!rtcProvider) {
      setConnectedPeerIds([]);
      return;
    }

    // Extract peers from provider
    const peers = extractPeersFromProvider(rtcProvider);
    trackedPeersRef.current = peers;

    // Create manager
    const manager = new ConversationTransferManager(peers);
    managerRef.current = manager;

    // Set up receive callback
    const cleanupReceive = manager.onReceiveConversation((messages, meta) => {
      const summary = summarizeA2AConversation(messages);
      setReceivedConversations((prev) => [
        ...prev,
        { messages, meta, summary, receivedAt: Date.now() },
      ]);
    });

    // Update connected peers list
    const updatePeerList = (): void => {
      const currentPeers = extractPeersFromProvider(rtcProvider);
      const ids = Array.from(currentPeers.entries())
        .filter(([_, peer]) => peer.connected)
        .map(([id]) => id);
      setConnectedPeerIds(ids);

      // Add new peers to manager
      for (const [peerId, peer] of currentPeers) {
        if (!trackedPeersRef.current.has(peerId)) {
          manager.addPeer(peerId, peer);
          trackedPeersRef.current.set(peerId, peer);
        }
      }

      // Remove disconnected peers
      for (const peerId of trackedPeersRef.current.keys()) {
        if (!currentPeers.has(peerId)) {
          manager.removePeer(peerId);
          trackedPeersRef.current.delete(peerId);
        }
      }
    };

    // Initial update
    updatePeerList();

    // Listen for peer changes via the provider's 'peers' event
    const handlePeersChange = (): void => {
      updatePeerList();
    };

    rtcProvider.on('peers', handlePeersChange);

    // Poll for changes (backup for missed events)
    const pollInterval = setInterval(() => {
      const currentPeers = extractPeersFromProvider(rtcProvider);
      if (currentPeers.size !== lastPeerCountRef.current) {
        lastPeerCountRef.current = currentPeers.size;
        updatePeerList();
      }
    }, 2000);

    return () => {
      cleanupReceive();
      rtcProvider.off('peers', handlePeersChange);
      clearInterval(pollInterval);
      manager.dispose();
      managerRef.current = null;
      trackedPeersRef.current.clear();
    };
  }, [rtcProvider]);

  /**
   * Export conversation transcript to A2A file format.
   */
  const exportToFile = useCallback(
    async (transcript: string): Promise<ExportResult> => {
      setIsProcessing(true);
      setProgress({ current: 0, total: 3, stage: 'preparing' });

      try {
        // 1. Parse transcript
        const parseResult = parseClaudeCodeTranscriptString(transcript);
        if (parseResult.messages.length === 0) {
          return { success: false, error: 'No messages found in transcript' };
        }

        setProgress({ current: 1, total: 3, stage: 'compressing' });

        // 2. Convert to A2A format
        const a2aMessages = claudeCodeToA2A(parseResult.messages, planId);

        // 3. Build export package
        const metadata = getPlanMetadata();
        const sourcePlatform = metadata.origin?.platform ?? 'claude-code';
        const sourceSessionId =
          (metadata.origin?.platform === 'claude-code' && metadata.origin.sessionId) ||
          (metadata.origin?.platform === 'devin' && metadata.origin.sessionId) ||
          planId;
        const exportMeta: ConversationExportMeta = {
          exportId: crypto.randomUUID(),
          sourcePlatform,
          sourceSessionId,
          planId,
          exportedAt: Date.now(),
          messageCount: a2aMessages.length,
          compressedBytes: 0,
          uncompressedBytes: 0,
        };

        const exportPackage = {
          meta: exportMeta,
          messages: a2aMessages,
        };

        const jsonString = JSON.stringify(exportPackage, null, 2);
        exportMeta.uncompressedBytes = jsonString.length;

        setProgress({ current: 2, total: 3, stage: 'transferring' });

        // 4. Download as file
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const filename = `conversation-${planId.slice(0, 8)}-${Date.now()}.a2a.json`;

        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        anchor.click();
        URL.revokeObjectURL(url);

        setProgress({ current: 3, total: 3, stage: 'done' });

        return {
          success: true,
          filename,
          messageCount: a2aMessages.length,
        };
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error during export';
        return { success: false, error: errorMessage };
      } finally {
        setIsProcessing(false);
        // Clear progress after a short delay
        setTimeout(() => setProgress(null), 1000);
      }
    },
    [planId, getPlanMetadata]
  );

  /**
   * Import conversation from A2A JSON file.
   */
  const importFromFile = useCallback(async (file: File): Promise<ImportResult> => {
    setIsProcessing(true);
    setProgress({ current: 0, total: 3, stage: 'preparing' });

    try {
      // 1. Read file
      const content = await file.text();
      setProgress({ current: 1, total: 3, stage: 'compressing' });

      // 2. Parse and validate
      const parsed: unknown = JSON.parse(content);
      const validated = ImportedConversationSchema.safeParse(parsed);

      if (!validated.success) {
        return {
          success: false,
          error: `Invalid file format: ${validated.error.message}`,
        };
      }

      setProgress({ current: 2, total: 3, stage: 'transferring' });

      // 3. Validate messages
      const { valid, errors } = validateA2AMessages(validated.data.messages);

      if (errors.length > 0 && valid.length === 0) {
        return {
          success: false,
          error: `No valid messages found. First error: ${errors[0]?.error}`,
        };
      }

      // 4. Generate summary
      const summary = summarizeA2AConversation(valid);

      setProgress({ current: 3, total: 3, stage: 'done' });

      const meta: ConversationExportMeta = {
        exportId: validated.data.meta.exportId,
        sourcePlatform: validated.data.meta.sourcePlatform,
        sourceSessionId: validated.data.meta.sourceSessionId,
        planId: validated.data.meta.planId,
        exportedAt: validated.data.meta.exportedAt,
        messageCount: valid.length,
        compressedBytes: validated.data.meta.compressedBytes ?? 0,
        uncompressedBytes: validated.data.meta.uncompressedBytes ?? content.length,
      };

      return {
        success: true,
        messages: valid,
        meta,
        summary,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error during import';
      return { success: false, error: errorMessage };
    } finally {
      setIsProcessing(false);
      setTimeout(() => setProgress(null), 1000);
    }
  }, []);

  /**
   * Send conversation to P2P peer via WebRTC.
   */
  const sendToPeer = useCallback(
    async (peerId: string, messages: A2AMessage[], options: SendOptions = {}): Promise<boolean> => {
      const manager = managerRef.current;
      if (!manager) {
        return false;
      }

      const metadata = getPlanMetadata();
      const exportId = crypto.randomUUID();

      setIsProcessing(true);
      setProgress({
        exportId,
        direction: 'sending',
        peerId,
        current: 0,
        total: 1,
        stage: 'preparing',
        percentage: 0,
      });

      try {
        const sourcePlatform = metadata.origin?.platform ?? 'claude-code';
        const sourceSessionId =
          (metadata.origin?.platform === 'claude-code' && metadata.origin.sessionId) ||
          (metadata.origin?.platform === 'devin' && metadata.origin.sessionId) ||
          planId;
        await manager.sendConversation(
          peerId,
          messages,
          {
            sourcePlatform,
            sourceSessionId,
            planId,
            exportedAt: Date.now(),
          },
          {
            onProgress: (sent, total) => {
              const percentage = Math.round((sent / total) * 100);
              setProgress({
                exportId,
                direction: 'sending',
                peerId,
                current: sent,
                total,
                stage: 'transferring',
                percentage,
              });
              options.onProgress?.(sent, total);
            },
            onComplete: () => {
              setProgress({
                exportId,
                direction: 'sending',
                peerId,
                current: 1,
                total: 1,
                stage: 'done',
                percentage: 100,
              });
              setTimeout(() => {
                setProgress(null);
                setIsProcessing(false);
              }, 1000);
              options.onComplete?.();
            },
            onError: (error) => {
              setProgress(null);
              setIsProcessing(false);
              options.onError?.(error);
            },
          }
        );

        return true;
      } catch (_err) {
        setProgress(null);
        setIsProcessing(false);
        return false;
      }
    },
    [getPlanMetadata, planId]
  );

  /**
   * Cancel an in-progress transfer.
   */
  const cancelTransfer = useCallback((exportId: string): void => {
    const manager = managerRef.current;
    if (manager) {
      manager.cancelTransfer(exportId);
    }
    setProgress(null);
    setIsProcessing(false);
  }, []);

  /**
   * Clear received conversations list.
   */
  const clearReceived = useCallback(() => {
    setReceivedConversations([]);
  }, []);

  return {
    exportToFile,
    importFromFile,
    sendToPeer,
    cancelTransfer,
    receivedConversations,
    clearReceived,
    progress,
    isProcessing,
    connectedPeerIds,
    isP2PAvailable: connectedPeerIds.length > 0,
  };
}
