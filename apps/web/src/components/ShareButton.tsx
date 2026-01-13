import { Button } from '@heroui/react';
import { buildInviteUrl, type InviteCreatedResponse } from '@peer-plan/schema';
import { AlertTriangle, Check, Loader2, Share2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { WebrtcProvider } from 'y-webrtc';

interface ShareButtonProps {
  planId?: string;
  rtcProvider?: WebrtcProvider | null;
  isOwner?: boolean;
  className?: string;
}

/**
 * Button to create and share invite links for P2P collaboration.
 *
 * For owners: Creates time-limited invite tokens (30min TTL, unlimited uses).
 * For non-owners: Copies current URL to clipboard.
 */
export function ShareButton({ planId, rtcProvider, isOwner = false, className }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  // Helper to copy text to clipboard
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

  // Simple share - just copy current URL
  const handleSimpleShare = useCallback(async () => {
    await copyToClipboard(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [copyToClipboard]);

  // Create invite via signaling server (defaults: 30min TTL, unlimited uses)
  const createInvite = useCallback(() => {
    if (!rtcProvider || !planId) {
      handleSimpleShare();
      return;
    }

    setIsCreating(true);

    // Set timeout (5 seconds) - if no response, show error
    const timeout = setTimeout(() => {
      console.error('[ShareButton] No invite_created response after 5s');
      setIsCreating(false);
      toast.error('Failed to create invite link', {
        description: 'Signaling server not responding. Try copying the plain URL instead.',
      });
    }, 5000);

    // Store timeout ID to clear it if we get a response
    (window as any).__shareButtonTimeout = timeout;

    const message = JSON.stringify({
      type: 'create_invite',
      planId,
      ttlMinutes: 30, // Default: 30 minutes
      maxUses: null, // Default: unlimited
    });

    // Send to signaling server
    const signalingConns = (rtcProvider as unknown as { signalingConns: Array<{ ws: WebSocket }> })
      .signalingConns;

    let sent = false;
    if (signalingConns) {
      for (const conn of signalingConns) {
        if (conn.ws && conn.ws.readyState === WebSocket.OPEN) {
          conn.ws.send(message);
          sent = true;
          break;
        }
      }
    }

    if (!sent) {
      clearTimeout(timeout);
      setIsCreating(false);
      // Fall back to copying current URL
      handleSimpleShare();
    }
  }, [rtcProvider, planId, handleSimpleShare]);

  // Listen for invite_created response from signaling server
  useEffect(() => {
    if (!rtcProvider || !isOwner || !planId) return;

    const handleMessage = async (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as InviteCreatedResponse;
        if (data.type === 'invite_created') {
          // Clear the timeout fallback
          const timeout = (window as any).__shareButtonTimeout;
          if (timeout) {
            clearTimeout(timeout);
            delete (window as any).__shareButtonTimeout;
          }

          // Build the invite URL
          const baseUrl = window.location.origin;
          const inviteUrl = buildInviteUrl(baseUrl, planId, data.tokenId, data.tokenValue);

          // Copy to clipboard
          await copyToClipboard(inviteUrl);

          setIsCreating(false);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }
      } catch {
        // Not JSON or not our message
      }
    };

    // Access signaling connections
    const signalingConns = (rtcProvider as unknown as { signalingConns: Array<{ ws: WebSocket }> })
      .signalingConns;

    if (signalingConns) {
      for (const conn of signalingConns) {
        if (conn.ws) {
          conn.ws.addEventListener('message', handleMessage);
        }
      }
    }

    return () => {
      if (signalingConns) {
        for (const conn of signalingConns) {
          if (conn.ws) {
            conn.ws.removeEventListener('message', handleMessage);
          }
        }
      }
    };
  }, [rtcProvider, isOwner, planId, copyToClipboard]);

  // Owner creates invite link, non-owner copies plain URL
  const handleShare = isOwner && rtcProvider && planId ? createInvite : handleSimpleShare;

  return (
    <Button
      isIconOnly
      variant="ghost"
      size="sm"
      onPress={handleShare}
      className={`${className} touch-target`}
      aria-label={isOwner ? 'Create invite link' : 'Copy link to share with reviewers'}
    >
      {copied ? (
        <Check className="w-4 h-4 text-success" />
      ) : isCreating ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <Share2 className="w-4 h-4" />
      )}
    </Button>
  );
}
