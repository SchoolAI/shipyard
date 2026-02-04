/**
 * Share button for copying task links.
 *
 * Copies the task URL to clipboard so users can share it with collaborators.
 * The task is accessible via the URL - real-time sync happens automatically
 * when multiple users are viewing the same task (via Loro WebRTC).
 */

import { Button, Tooltip } from '@heroui/react';
import type { TaskId } from '@shipyard/loro-schema';
import { Check, Share2 } from 'lucide-react';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { TIMEOUTS } from '@/constants/timings';
import { useGitHubAuth } from '@/hooks/use-github-auth';

interface ShareButtonProps {
  taskId: TaskId;
  className?: string;
}

/**
 * Button to copy task link to clipboard for sharing.
 *
 * The task is viewable via the URL. Real-time collaboration happens
 * automatically when multiple users view the same task.
 */
export function ShareButton({ taskId, className }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);
  const { identity } = useGitHubAuth();

  const copyToClipboard = useCallback(async (text: string) => {
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
  }, []);

  /**
   * Build the shareable task URL.
   * Uses the current origin + base path + task route.
   */
  const buildTaskUrl = useCallback((): string => {
    const base = window.location.origin + (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
    return `${base}/task/${taskId}`;
  }, [taskId]);

  /**
   * Copy the task URL to clipboard.
   */
  const handleShare = useCallback(async () => {
    const url = buildTaskUrl();
    await copyToClipboard(url);
    setCopied(true);
    setTimeout(() => setCopied(false), TIMEOUTS.ICON_REVERT_DELAY);

    if (identity) {
      toast.success('Link copied!', {
        description: 'Share this link to collaborate on the task.',
      });
    } else {
      toast.info('Link copied', {
        description: 'Sign in with GitHub to enable real-time collaboration.',
      });
    }
  }, [buildTaskUrl, copyToClipboard, identity]);

  const tooltipContent = 'Copy link to share';

  const button = (
    <Button
      isIconOnly
      variant="ghost"
      size="sm"
      onPress={handleShare}
      className={`${className ?? ''} touch-target`}
      aria-label={tooltipContent}
    >
      {copied ? <Check className="w-4 h-4 text-success" /> : <Share2 className="w-4 h-4" />}
    </Button>
  );

  return (
    <Tooltip delay={0}>
      <Tooltip.Trigger>{button}</Tooltip.Trigger>
      <Tooltip.Content>{tooltipContent}</Tooltip.Content>
    </Tooltip>
  );
}
