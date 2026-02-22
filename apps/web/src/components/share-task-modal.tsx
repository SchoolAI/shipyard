import { Modal } from '@heroui/react';
import { Check, Clock, Copy, Loader2, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useCreateShareLink } from '../hooks/use-create-share-link';

export interface ShareTaskParticipant {
  userId: string;
  username: string;
  role: string;
  avatarUrl?: string | null;
}

interface ShareTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  taskId: string | null;
  taskTitle: string;
  participants: ShareTaskParticipant[];
  onRoomCreated?: (collabWsUrl: string) => void;
}

const EXPIRATION_OPTIONS = [
  { minutes: 60, label: '1h' },
  { minutes: 240, label: '4h' },
  { minutes: 1440, label: '24h' },
  { minutes: 10080, label: '7d' },
] as const;

type PermissionLevel = 'collaborator-full' | 'collaborator-review' | 'viewer';

const PERMISSION_OPTIONS: { value: PermissionLevel; label: string }[] = [
  { value: 'collaborator-full', label: 'Full Access' },
  { value: 'collaborator-review', label: 'Review Only' },
  { value: 'viewer', label: 'View Only' },
];

function formatTimeRemaining(expiresAt: number): string {
  const remaining = expiresAt - Date.now();
  if (remaining <= 0) return 'Expired';
  const hours = Math.floor(remaining / (1000 * 60 * 60));
  const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function RoleBadge({ role }: { role: string }) {
  const isOwner = role === 'owner';
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-[0.03em] ${
        isOwner ? 'bg-accent/15 text-accent' : 'bg-success/15 text-success'
      }`}
    >
      {role}
    </span>
  );
}

function ParticipantRow({ participant }: { participant: ShareTaskParticipant }) {
  const isOwner = participant.role === 'owner';
  return (
    <div className="flex items-center gap-2.5 py-2 [&+&]:border-t [&+&]:border-separator">
      <span
        className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-[13px] font-semibold shrink-0 ${
          isOwner
            ? 'bg-[rgba(59,130,246,0.15)] text-[#3b82f6]'
            : 'bg-[rgba(34,197,94,0.15)] text-[#22c55e]'
        }`}
      >
        {participant.avatarUrl ? (
          <img
            src={participant.avatarUrl}
            alt=""
            className="w-full h-full rounded-full object-cover"
          />
        ) : (
          <span aria-hidden="true">{participant.username.charAt(0).toUpperCase()}</span>
        )}
      </span>
      <span className="flex-1 min-w-0 text-[13px] font-medium text-foreground truncate">
        {participant.username}
      </span>
      <RoleBadge role={participant.role} />
    </div>
  );
}

export function ShareTaskModal({
  isOpen,
  onClose,
  taskId,
  taskTitle,
  participants,
  onRoomCreated,
}: ShareTaskModalProps) {
  const [expirationMinutes, setExpirationMinutes] = useState(240);
  const [permissionLevel, setPermissionLevel] = useState<PermissionLevel>('collaborator-full');
  const [copied, setCopied] = useState(false);

  const { createShareLink, shareUrl, collabWsUrl, expiresAt, isLoading, error, reset } =
    useCreateShareLink({ taskId });

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (collabWsUrl && onRoomCreated) {
      onRoomCreated(collabWsUrl);
    }
  }, [collabWsUrl, onRoomCreated]);

  useEffect(() => {
    reset();
    setCopied(false);
    setExpirationMinutes(240);
    setPermissionLevel('collaborator-full');
  }, [taskId, reset]);

  const handleCreateLink = useCallback(async () => {
    await createShareLink(expirationMinutes, permissionLevel);
  }, [createShareLink, expirationMinutes, permissionLevel]);

  const handleCopy = useCallback(async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // NOTE: Clipboard API may fail in some environments
    }
  }, [shareUrl]);

  return (
    <Modal.Backdrop isOpen={isOpen} onOpenChange={handleOpenChange} isDismissable>
      <Modal.Container placement="center" size="md">
        <Modal.Dialog aria-labelledby="share-dialog-title">
          <div className="bg-overlay border border-separator rounded-xl shadow-[0_24px_48px_rgba(0,0,0,0.4)] w-[420px] max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 pt-4 pb-3">
              <h2 id="share-dialog-title" className="text-[15px] font-semibold text-foreground">
                Share Task
              </h2>
              <button
                type="button"
                className="w-7 h-7 flex items-center justify-center rounded-md bg-transparent border-none text-muted cursor-pointer transition-colors hover:bg-default hover:text-foreground"
                onClick={onClose}
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {taskTitle && (
              <div className="px-5 pb-4 text-[13px] text-muted leading-relaxed border-b border-separator">
                {taskTitle}
              </div>
            )}

            <div className="px-5 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted mb-3">
                Create Share Link
              </p>

              {!shareUrl ? (
                <>
                  <div
                    className="flex bg-default rounded-lg p-[3px] gap-[2px] mb-3"
                    role="radiogroup"
                    aria-label="Link expiration"
                  >
                    {EXPIRATION_OPTIONS.map((opt) => (
                      <button
                        key={opt.minutes}
                        type="button"
                        role="radio"
                        aria-checked={expirationMinutes === opt.minutes}
                        className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer border-none bg-transparent ${
                          expirationMinutes === opt.minutes
                            ? 'bg-overlay text-foreground shadow-[0_1px_3px_rgba(0,0,0,0.3)]'
                            : 'text-muted hover:text-foreground'
                        }`}
                        onClick={() => setExpirationMinutes(opt.minutes)}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  <div
                    className="flex bg-default rounded-lg p-[3px] gap-[2px] mb-3"
                    role="radiogroup"
                    aria-label="Permission level"
                  >
                    {PERMISSION_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        role="radio"
                        aria-checked={permissionLevel === opt.value}
                        className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer border-none bg-transparent ${
                          permissionLevel === opt.value
                            ? 'bg-overlay text-foreground shadow-[0_1px_3px_rgba(0,0,0,0.3)]'
                            : 'text-muted hover:text-foreground'
                        }`}
                        onClick={() => setPermissionLevel(opt.value)}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    className="w-full py-2 px-4 bg-accent hover:bg-accent/90 text-accent-foreground text-[13px] font-medium rounded-lg transition-colors border-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    onClick={handleCreateLink}
                    disabled={isLoading || !taskId}
                  >
                    {isLoading && (
                      <Loader2
                        className="w-3.5 h-3.5 motion-safe:animate-spin"
                        aria-hidden="true"
                      />
                    )}
                    {isLoading ? 'Creating...' : 'Create Link'}
                  </button>

                  {error && (
                    <p className="text-xs text-danger mt-2" role="alert">
                      {error}
                    </p>
                  )}
                </>
              ) : (
                <>
                  <div className="flex gap-2 items-center mb-2">
                    <input
                      type="text"
                      readOnly
                      value={shareUrl}
                      className="flex-1 min-w-0 px-3 py-2 bg-default border border-separator rounded-lg text-foreground text-xs font-mono outline-none"
                      aria-label="Share URL"
                      onFocus={(e) => e.target.select()}
                    />
                    <button
                      type="button"
                      className={`w-9 h-9 flex items-center justify-center border rounded-lg shrink-0 transition-all cursor-pointer ${
                        copied
                          ? 'bg-success/15 border-success text-success'
                          : 'bg-default border-separator text-muted hover:text-foreground hover:bg-default-100 hover:border-muted'
                      }`}
                      onClick={handleCopy}
                      aria-label={copied ? 'Copied' : 'Copy link'}
                    >
                      {copied ? (
                        <Check className="w-3.5 h-3.5" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                  {expiresAt && (
                    <p className="flex items-center gap-1 text-[11px] text-muted">
                      <Clock className="w-3 h-3" aria-hidden="true" />
                      Link expires in {formatTimeRemaining(expiresAt)}
                    </p>
                  )}
                </>
              )}
            </div>

            {participants.length > 0 && (
              <div className="px-5 py-4 border-t border-separator">
                <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted mb-3">
                  People with access
                </p>
                <div role="list" aria-label="Participants">
                  {participants.map((p) => (
                    <ParticipantRow key={p.userId} participant={p} />
                  ))}
                </div>
              </div>
            )}

            <div className="px-5 py-3 border-t border-separator flex justify-end">
              <button
                type="button"
                className="px-4 py-[7px] border border-separator bg-transparent text-foreground text-[13px] font-medium rounded-lg cursor-pointer transition-all hover:bg-default hover:border-muted"
                onClick={onClose}
              >
                Close
              </button>
            </div>
          </div>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
