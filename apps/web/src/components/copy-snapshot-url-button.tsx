/**
 * Button to generate and copy a shareable snapshot URL.
 *
 * The URL includes all task data encoded in the query string and
 * uses the OG proxy worker for proper Open Graph metadata.
 *
 * Unlike the regular share link, snapshot URLs contain a frozen copy
 * of the task state - useful for embedding in PRs or sharing externally.
 */

import { Button, Tooltip } from '@heroui/react';
import { isTaskStatus, type TaskId, type TaskMeta } from '@shipyard/loro-schema';
import { Check, Link2, Loader2 } from 'lucide-react';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { TIMEOUTS } from '@/constants/timings';
import {
  useTaskArtifacts,
  useTaskContent,
  useTaskDeliverables,
  useTaskMeta,
} from '@/loro/selectors/task-selectors';
import {
  createTaskUrl,
  type SnapshotArtifact,
  type SnapshotDeliverable,
  type UrlEncodedTask,
} from '@/utils/snapshot-url';

/**
 * Get the OG proxy base URL from environment or use default.
 * The OG proxy worker generates social preview metadata for snapshot URLs.
 */
function getOgProxyBaseUrl(): string {
  return import.meta.env.VITE_OG_PROXY_URL || 'https://shipyard-og-proxy.jacob-191.workers.dev';
}

/**
 * Copy text to clipboard with fallback for older browsers.
 */
async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Fallback for older browsers
    const textArea = document.createElement('textarea');
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
  }
}

interface TaskSnapshotData {
  meta: TaskMeta;
  content: unknown;
  artifacts: Array<{
    id: string;
    storage: string;
    type: string;
    filename: string;
    description: string | null;
    uploadedAt: number | null;
    url: string;
  }>;
  deliverables: Array<{
    id: string;
    text: string;
    linkedArtifactId: string | null;
    linkedAt: number | null;
  }>;
}

/**
 * Generate a snapshot URL from task data.
 * Can be used directly when task data is already available (e.g., mobile dropdown).
 */
export function generateSnapshotUrl(data: TaskSnapshotData): string {
  const { meta, content, artifacts, deliverables } = data;

  // Map artifacts to snapshot format
  const snapshotArtifacts: SnapshotArtifact[] = artifacts.map((artifact) => ({
    id: artifact.id,
    name: artifact.filename,
    type: artifact.type,
    url: artifact.url,
    createdAt: artifact.uploadedAt ?? Date.now(),
    deliverableId: null, // Not tracked in the current schema
  }));

  // Map deliverables to snapshot format
  const snapshotDeliverables: SnapshotDeliverable[] = deliverables.map((deliverable) => ({
    id: deliverable.id,
    text: deliverable.text,
    linkedArtifactId: deliverable.linkedArtifactId,
    linkedAt: deliverable.linkedAt ?? undefined,
  }));

  // Build the URL-encoded task object
  const urlEncodedTask: UrlEncodedTask = {
    v: 1,
    id: meta.id,
    title: meta.title,
    status: isTaskStatus(meta.status) ? meta.status : 'draft',
    repo: meta.repo ?? undefined,
    content: content ? [content] : undefined,
    artifacts: snapshotArtifacts.length > 0 ? snapshotArtifacts : undefined,
    deliverables: snapshotDeliverables.length > 0 ? snapshotDeliverables : undefined,
  };

  // Generate the snapshot URL using OG proxy worker as base
  const baseUrl = getOgProxyBaseUrl();
  return createTaskUrl(baseUrl, urlEncodedTask);
}

/**
 * Hook to get a function that generates and copies the snapshot URL for a task.
 * Useful for mobile dropdown menus or other contexts where the button isn't used.
 */
export function useCopySnapshotUrl(taskId: TaskId) {
  const meta = useTaskMeta(taskId);
  const content = useTaskContent(taskId);
  const artifacts = useTaskArtifacts(taskId);
  const deliverables = useTaskDeliverables(taskId);

  return useCallback(async () => {
    try {
      const snapshotUrl = generateSnapshotUrl({
        meta,
        content,
        artifacts,
        deliverables,
      });
      await copyToClipboard(snapshotUrl);
      toast.success('Snapshot URL copied to clipboard');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      toast.error(`Failed to generate snapshot URL: ${errorMessage}`);
    }
  }, [meta, content, artifacts, deliverables]);
}

interface CopySnapshotUrlButtonProps {
  taskId: TaskId;
  className?: string;
}

/**
 * Button to generate and copy a shareable snapshot URL.
 *
 * Encodes the current task state (metadata, content, artifacts, deliverables)
 * into a compressed URL that can be shared externally or embedded in PRs.
 */
export function CopySnapshotUrlButton({ taskId, className }: CopySnapshotUrlButtonProps) {
  const [copied, setCopied] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const meta = useTaskMeta(taskId);
  const content = useTaskContent(taskId);
  const artifacts = useTaskArtifacts(taskId);
  const deliverables = useTaskDeliverables(taskId);

  const handleCopySnapshotUrl = useCallback(async () => {
    setIsGenerating(true);

    try {
      const snapshotUrl = generateSnapshotUrl({
        meta,
        content,
        artifacts,
        deliverables,
      });

      // Copy to clipboard
      await copyToClipboard(snapshotUrl);

      setCopied(true);
      setTimeout(() => setCopied(false), TIMEOUTS.ICON_REVERT_DELAY);

      toast.success('Snapshot URL copied to clipboard');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      toast.error(`Failed to generate snapshot URL: ${errorMessage}`);
    } finally {
      setIsGenerating(false);
    }
  }, [meta, content, artifacts, deliverables]);

  const tooltipContent = 'Copy snapshot URL for sharing';

  const button = (
    <Button
      isIconOnly
      variant="ghost"
      size="sm"
      onPress={handleCopySnapshotUrl}
      className={`${className ?? ''} touch-target`}
      aria-label={tooltipContent}
    >
      {copied ? (
        <Check className="w-4 h-4 text-success" />
      ) : isGenerating ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <Link2 className="w-4 h-4" />
      )}
    </Button>
  );

  return (
    <Tooltip delay={0}>
      <Tooltip.Trigger>{button}</Tooltip.Trigger>
      <Tooltip.Content>{tooltipContent}</Tooltip.Content>
    </Tooltip>
  );
}
