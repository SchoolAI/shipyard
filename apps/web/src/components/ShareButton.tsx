import { Button, Popover, Radio, RadioGroup, TextField } from '@heroui/react';
import { buildInviteUrl, type InviteCreatedResponse } from '@peer-plan/schema';
import { Check, Clock, Link2, Loader2, Share2, Users } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { WebrtcProvider } from 'y-webrtc';

interface ShareButtonProps {
  planId?: string;
  rtcProvider?: WebrtcProvider | null;
  isOwner?: boolean;
  className?: string;
}

interface InviteOptions {
  ttlMinutes: number;
  maxUses: number | null;
  label: string;
}

const TTL_OPTIONS = [
  { value: 30, label: '30 minutes' },
  { value: 60, label: '1 hour' },
  { value: 1440, label: '24 hours' },
];

const MAX_USES_OPTIONS = [
  { value: null, label: 'Unlimited' },
  { value: 1, label: '1 use' },
  { value: 5, label: '5 uses' },
  { value: 10, label: '10 uses' },
];

/**
 * Button to create and share invite links for P2P collaboration.
 *
 * For owners: Creates time-limited invite tokens via signaling server.
 * For non-owners: Copies current URL to clipboard.
 */
export function ShareButton({ planId, rtcProvider, isOwner = false, className }: ShareButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [options, setOptions] = useState<InviteOptions>({
    ttlMinutes: 30,
    maxUses: null,
    label: '',
  });

  // Listen for invite_created response from signaling server
  useEffect(() => {
    if (!rtcProvider || !isOwner) return;

    const handleMessage = async (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as InviteCreatedResponse;
        if (data.type === 'invite_created') {
          // Build the invite URL
          const baseUrl = window.location.origin;
          const inviteUrl = buildInviteUrl(baseUrl, planId!, data.tokenId, data.tokenValue);

          // Copy to clipboard
          await copyToClipboard(inviteUrl);

          setIsCreating(false);
          setCopied(true);
          setIsOpen(false);
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

  const copyToClipboard = async (text: string) => {
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
  };

  const createInvite = useCallback(() => {
    if (!rtcProvider || !planId) return;

    setIsCreating(true);

    const message = JSON.stringify({
      type: 'create_invite',
      planId,
      ttlMinutes: options.ttlMinutes,
      maxUses: options.maxUses,
      label: options.label || undefined,
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
      setIsCreating(false);
      // Fall back to copying current URL
      handleSimpleShare();
    }
  }, [
    rtcProvider,
    planId,
    options, // Fall back to copying current URL
    handleSimpleShare,
  ]);

  const handleSimpleShare = async () => {
    await copyToClipboard(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // For non-owners or when rtcProvider isn't available, just copy URL
  if (!isOwner || !rtcProvider || !planId) {
    return (
      <Button
        isIconOnly
        variant="ghost"
        size="sm"
        onPress={handleSimpleShare}
        className={`${className} touch-target`}
        aria-label="Copy link to share with reviewers"
      >
        {copied ? <Check className="w-4 h-4 text-success" /> : <Share2 className="w-4 h-4" />}
      </Button>
    );
  }

  // Owner view with invite options
  return (
    <Popover isOpen={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger>
        <Button
          isIconOnly
          variant="ghost"
          size="sm"
          className={`${className} touch-target`}
          aria-label="Create invite link"
        >
          {copied ? (
            <Check className="w-4 h-4 text-success" />
          ) : isCreating ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Share2 className="w-4 h-4" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-4">
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-medium text-foreground mb-1">Create Invite Link</h3>
            <p className="text-xs text-muted-foreground">
              Generate a time-limited link for reviewers
            </p>
          </div>

          {/* TTL Selection */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Expires in
            </label>
            <RadioGroup
              value={String(options.ttlMinutes)}
              onValueChange={(value) =>
                setOptions({ ...options, ttlMinutes: Number.parseInt(value, 10) })
              }
              size="sm"
            >
              {TTL_OPTIONS.map((opt) => (
                <Radio key={opt.value} value={String(opt.value)}>
                  {opt.label}
                </Radio>
              ))}
            </RadioGroup>
          </div>

          {/* Max Uses Selection */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <Users className="w-3 h-3" />
              Max uses
            </label>
            <RadioGroup
              value={String(options.maxUses ?? 'unlimited')}
              onValueChange={(value) => {
                setOptions({
                  ...options,
                  maxUses: value === 'unlimited' ? null : Number.parseInt(value, 10),
                });
              }}
              size="sm"
            >
              {MAX_USES_OPTIONS.map((opt) => (
                <Radio
                  key={String(opt.value ?? 'unlimited')}
                  value={String(opt.value ?? 'unlimited')}
                >
                  {opt.label}
                </Radio>
              ))}
            </RadioGroup>
          </div>

          {/* Optional Label */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Label (optional)</label>
            <TextField
              aria-label="Invite label"
              placeholder="e.g., Team review"
              value={options.label}
              onChange={(e) => setOptions({ ...options, label: e.target.value })}
              size="sm"
            />
          </div>

          {/* Create Button */}
          <Button
            onPress={createInvite}
            isDisabled={isCreating}
            variant="primary"
            className="w-full"
          >
            {isCreating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Link2 className="w-4 h-4" />
                Create & Copy Link
              </>
            )}
          </Button>

          {/* Quick copy of plain URL */}
          <button
            type="button"
            onClick={handleSimpleShare}
            className="text-xs text-muted-foreground hover:text-foreground w-full text-center"
          >
            Or copy plain URL (no invite token)
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
