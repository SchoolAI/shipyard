/**
 * useConversationTransfer - React hook for file-based conversation import/export
 *
 * This hook provides file-based import and export capabilities for A2A conversation files.
 * It handles parsing, validation, summarization, and file download generation.
 *
 * Features:
 * - Export conversations to .a2a.json files (handoff)
 * - Import .a2a.json files (resume)
 * - Progress tracking for UI feedback
 *
 * Note: P2P transfer functionality from the legacy hook is not included here.
 * P2P transfers require WebRTC and y-webrtc infrastructure that will be added later.
 *
 * @see Issue #41 - Context Teleportation
 */

import { useCallback, useState } from 'react';
import { TIMEOUTS } from '@/constants/timings';
import {
  type A2AMessage,
  type ConversationExportMeta,
  ImportedConversationSchema,
  summarizeA2AConversation,
  validateA2AMessages,
} from '@/types/a2a';

/**
 * Progress callback for transfer operations.
 */
export type TransferProgress =
  | {
      stage: 'preparing' | 'parsing' | 'validating' | 'compressing';
      current: number;
      total: number;
    }
  | {
      stage: 'done';
      exportId: string;
    };

/**
 * Result of an export operation.
 */
export type ExportResult =
  | { success: true; filename: string; messageCount: number }
  | { success: false; error: string };

/**
 * Result of an import operation.
 */
export type ImportResult =
  | {
      success: true;
      messages: A2AMessage[];
      meta: ConversationExportMeta;
      summary: { title: string; text: string };
    }
  | { success: false; error: string };

/**
 * Received conversation (stored for later processing).
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
  exportToFile: (
    messages: A2AMessage[],
    meta: Omit<ConversationExportMeta, 'exportId' | 'exportedAt'>
  ) => Promise<ExportResult>;
  /** Import conversation from file */
  importFromFile: (file: File) => Promise<ImportResult>;
  /** Current transfer progress */
  progress: TransferProgress | null;
  /** Whether an operation is in progress */
  isProcessing: boolean;
}

/**
 * Hook for importing and exporting A2A conversation files.
 *
 * @param taskId - Current task ID (used in export filename)
 *
 * Usage:
 * ```typescript
 * const { importFromFile, exportToFile, isProcessing } = useConversationTransfer('task-123');
 *
 * // Import
 * const handleFile = async (file: File) => {
 *   const result = await importFromFile(file);
 *   if (result.success) {
 *     console.log('Imported', result.messages.length, 'messages');
 *   }
 * };
 *
 * // Export
 * const handleExport = async (messages: A2AMessage[]) => {
 *   const result = await exportToFile(messages, {
 *     sourcePlatform: 'claude-code',
 *     sourceSessionId: 'session-123',
 *     planId: 'task-123',
 *     messageCount: messages.length,
 *   });
 *   if (result.success) {
 *     console.log('Exported to', result.filename);
 *   }
 * };
 * ```
 */
export function useConversationTransfer(taskId: string): UseConversationTransferResult {
  const [progress, setProgress] = useState<TransferProgress | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  /**
   * Export A2A messages to file download.
   */
  const exportToFile = useCallback(
    async (
      messages: A2AMessage[],
      meta: Omit<ConversationExportMeta, 'exportId' | 'exportedAt'>
    ): Promise<ExportResult> => {
      setIsProcessing(true);
      setProgress({ current: 0, total: 3, stage: 'preparing' });

      try {
        if (messages.length === 0) {
          return { success: false, error: 'No messages to export' };
        }

        setProgress({ current: 1, total: 3, stage: 'compressing' });

        // Build export package
        const exportId = crypto.randomUUID();
        const exportMeta: ConversationExportMeta = {
          ...meta,
          exportId,
          exportedAt: Date.now(),
        };

        const exportPackage = {
          meta: exportMeta,
          messages,
        };

        const jsonString = JSON.stringify(exportPackage, null, 2);
        exportMeta.uncompressedBytes = jsonString.length;

        setProgress({ current: 2, total: 3, stage: 'compressing' });

        // Download as file
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const filename = `conversation-${taskId.slice(0, 8)}-${Date.now()}.a2a.json`;

        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        anchor.click();
        URL.revokeObjectURL(url);

        setProgress({
          stage: 'done',
          exportId: exportMeta.exportId,
        });

        return {
          success: true,
          filename,
          messageCount: messages.length,
        };
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error during export';
        return { success: false, error: errorMessage };
      } finally {
        setIsProcessing(false);
        setTimeout(() => setProgress(null), TIMEOUTS.PROGRESS_CLEAR_DELAY);
      }
    },
    [taskId]
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
      setProgress({ current: 1, total: 3, stage: 'parsing' });

      // 2. Parse and validate structure
      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch (_parseError) {
        return {
          success: false,
          error: 'Invalid JSON file',
        };
      }

      const validated = ImportedConversationSchema.safeParse(parsed);

      if (!validated.success) {
        return {
          success: false,
          error: `Invalid file format: ${validated.error.message}`,
        };
      }

      setProgress({ current: 2, total: 3, stage: 'validating' });

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

      const exportId = validated.data.meta.exportId;
      setProgress({
        stage: 'done',
        exportId,
      });

      const meta: ConversationExportMeta = {
        exportId: validated.data.meta.exportId,
        sourcePlatform: validated.data.meta.sourcePlatform,
        sourceSessionId: validated.data.meta.sourceSessionId,
        planId: validated.data.meta.planId,
        exportedAt: validated.data.meta.exportedAt,
        messageCount: valid.length,
        compressedBytes: validated.data.meta.compressedBytes,
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
      // Clear progress after a short delay
      setTimeout(() => setProgress(null), TIMEOUTS.PROGRESS_CLEAR_DELAY);
    }
  }, []);

  return {
    exportToFile,
    importFromFile,
    progress,
    isProcessing,
  };
}

// Re-export types for convenience
export type { A2AMessage, ConversationExportMeta } from '@/types/a2a';

// Legacy alias for backwards compatibility
export type ImportProgress = TransferProgress;
