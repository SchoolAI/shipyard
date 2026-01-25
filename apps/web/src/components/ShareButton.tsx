import { Button, Tooltip } from '@heroui/react';
import { buildInviteUrl, logPlanEvent } from '@shipyard/schema';
import { Check, Loader2, Share2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { WebrtcProvider } from 'y-webrtc';
import type * as Y from 'yjs';
import { useUserIdentity } from '@/contexts/UserIdentityContext';
import { useGitHubAuth } from '@/hooks/useGitHubAuth';
import { getSignalingConnections } from '@/types/y-webrtc-internals';

/** Extend Window interface for temporary timeout storage */
declare global {
  interface Window {
    __shareButtonTimeout?: ReturnType<typeof setTimeout>;
  }
}

interface ShareButtonProps {
  planId?: string;
  rtcProvider?: WebrtcProvider | null;
  isOwner?: boolean;
  className?: string;
  ydoc?: Y.Doc;
}

/**
 * Button to create and share invite links for P2P collaboration.
 *
 * For owners: Creates time-limited invite tokens (30min TTL, unlimited uses).
 * For non-owners: Copies current URL to clipboard.
 */
export function ShareButton({
  planId,
  rtcProvider,
  isOwner = false,
  className,
  ydoc,
}: ShareButtonProps) {
  const [copied, setCopied] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const { actor } = useUserIdentity();
  const { identity } = useGitHubAuth();

  const copyToClipboard = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /** Fallback for older browsers */
      const textArea = document.createElement('textarea');
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
    }
  }, []);

  /**
   * Simple share: copy the current URL (view-only access).
   * Used when the user is not the owner or cannot create invite links.
   */
  const handleSimpleShare = useCallback(async () => {
    await copyToClipboard(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);

    /** Show informative toast about view-only access */
    toast.info('Link copied (view-only access)', {
      description: 'Sign in as the plan owner to create invite links with full access.',
    });
  }, [copyToClipboard]);

  /** Send invite creation message via WebSocket */
  const sendInviteMessage = useCallback(
    (rtcProvider: WebrtcProvider, planId: string, authToken: string): boolean => {
      const message = JSON.stringify({
        type: 'create_invite',
        planId,
        authToken,
        ttlMinutes: 30,
        maxUses: null,
      });

      const signalingConns = getSignalingConnections(rtcProvider);

      for (const conn of signalingConns) {
        if (conn.ws && conn.ws.readyState === WebSocket.OPEN) {
          conn.ws.send(message);
          return true;
        }
      }
      return false;
    },
    []
  );

  /** Create invite via signaling server (defaults: 30min TTL, unlimited uses) */
  const createInvite = useCallback(() => {
    if (!rtcProvider || !planId) {
      /** Fallback to simple share if WebRTC isn't available */
      handleSimpleShare();
      return;
    }

    /*
     * This check shouldn't be needed since we disable the button when not signed in,
     * but keep it as a safety net
     */
    if (!identity || !identity.token) {
      toast.error('Sign in required', {
        description: 'You need to sign in with GitHub to create invite links.',
      });
      return;
    }

    setIsCreating(true);

    /** Set timeout (10 seconds) - if no response, show error */
    const timeout = setTimeout(() => {
      setIsCreating(false);
      toast.error('Failed to create invite link', {
        description:
          'Signaling server not responding after 10s. Try copying the plain URL instead.',
      });
    }, 10000);

    /** Store timeout ID to clear it if we get a response */
    window.__shareButtonTimeout = timeout;

    const sent = sendInviteMessage(rtcProvider, planId, identity.token);

    if (!sent) {
      clearTimeout(timeout);
      setIsCreating(false);
      /** Fall back to copying current URL */
      handleSimpleShare();
    }
  }, [rtcProvider, planId, identity, sendInviteMessage, handleSimpleShare]);

  /** Handle error responses from signaling server */
  const handleErrorResponse = useCallback((data: { error?: string }) => {
    const timeout = window.__shareButtonTimeout;
    if (timeout) {
      clearTimeout(timeout);
      delete window.__shareButtonTimeout;
    }

    setIsCreating(false);
    toast.error('Cannot create invite link', {
      description:
        data.error === 'unauthenticated'
          ? 'You need to sign in with GitHub to create invite links.'
          : `Error: ${data.error}`,
    });
  }, []);

  /** Handle successful invite creation from signaling server */
  const handleInviteCreated = useCallback(
    async (data: { tokenId: string; tokenValue: string }) => {
      /** Clear the timeout fallback */
      const timeout = window.__shareButtonTimeout;
      if (timeout) {
        clearTimeout(timeout);
        delete window.__shareButtonTimeout;
      }

      /** Build the invite URL with the correct base path (for GitHub Pages subdirectory deployment) */
      const baseUrl = window.location.origin + (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
      const inviteUrl = buildInviteUrl(baseUrl, planId || '', data.tokenId, data.tokenValue);

      /** Copy to clipboard */
      await copyToClipboard(inviteUrl);

      /** Log plan_shared event */
      if (ydoc) {
        logPlanEvent(ydoc, 'plan_shared', actor, undefined, {
          inboxWorthy: false,
        });
      }

      setIsCreating(false);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);

      /** Show success toast for invite link creation */
      toast.success('Invite link copied!', {
        description: 'Link expires in 30 minutes. Recipients can view and collaborate.',
      });
    },
    [planId, copyToClipboard, ydoc, actor]
  );

  /** Listen for invite_created response from signaling server */
  useEffect(() => {
    if (!rtcProvider || !isOwner || !planId) return;

    const handleMessage = async (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);

        /** Dispatch to appropriate handler based on message type */
        if (data.type === 'error') {
          handleErrorResponse(data);
          return;
        }

        if (data.type === 'invite_created') {
          await handleInviteCreated(data);
        }
      } catch {
        /** Not JSON or not our message */
      }
    };

    /** Access signaling connections */
    const signalingConns = getSignalingConnections(rtcProvider);

    for (const conn of signalingConns) {
      if (conn.ws) {
        conn.ws.addEventListener('message', handleMessage);
      }
    }

    return () => {
      for (const conn of signalingConns) {
        if (conn.ws) {
          conn.ws.removeEventListener('message', handleMessage);
        }
      }
    };
  }, [rtcProvider, isOwner, planId, handleErrorResponse, handleInviteCreated]);

  /**
   * Handle share button press with explicit logic for different scenarios:
   * - Not signed in: Button is disabled (handled by isDisabled prop)
   * - Signed in but NOT owner: Copy plain URL with view-only toast
   * - Signed in AND owner: Create invite token with success toast
   */
  const handleShare = useCallback(() => {
    /** Safety check - button should be disabled when not signed in */
    if (!identity) {
      toast.error('Sign in required', {
        description: 'You need to sign in with GitHub to share this plan.',
      });
      return;
    }

    /** Signed in but NOT owner: copy plain URL (view-only access) */
    if (!isOwner) {
      handleSimpleShare();
      return;
    }

    /** Signed in AND owner: create invite link */
    if (rtcProvider && planId) {
      createInvite();
    } else {
      /** Fallback if WebRTC not available */
      handleSimpleShare();
    }
  }, [identity, isOwner, rtcProvider, planId, createInvite, handleSimpleShare]);

  /** Determine button state and tooltip content */
  const isDisabled = !identity;
  const tooltipContent = !identity
    ? 'Sign in with GitHub to share this plan'
    : isOwner
      ? 'Create invite link'
      : 'Copy link to share with reviewers';

  const button = (
    <Button
      isIconOnly
      variant="ghost"
      size="sm"
      onPress={handleShare}
      isDisabled={isDisabled}
      className={`${className} touch-target`}
      aria-label={tooltipContent}
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

  /** Always wrap in tooltip to show contextual information */
  return (
    <Tooltip delay={0}>
      <Tooltip.Trigger>{button}</Tooltip.Trigger>
      <Tooltip.Content>{tooltipContent}</Tooltip.Content>
    </Tooltip>
  );
}
