/**
 * Overlapping avatar circles (Google Docs style) for showing
 * active collab participants in the top bar.
 *
 * Uses flex-direction: row-reverse so the first avatar in the array
 * sits on top visually (highest z-index). Overlapping via negative
 * margin-right on subsequent items.
 *
 * @see /tmp/mockups/top-bar-with-share.html for reference design
 */

const AVATAR_PALETTE = [
  { bg: 'bg-accent/15', fg: 'text-accent' },
  { bg: 'bg-success/15', fg: 'text-success' },
  { bg: 'bg-[oklch(0.55_0.16_300)]/15', fg: 'text-[oklch(0.55_0.16_300)]' },
  { bg: 'bg-warning/15', fg: 'text-warning' },
  { bg: 'bg-danger/15', fg: 'text-danger' },
] as const;

function hashToIndex(str: string, max: number): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % max;
}

function getAvatarPalette(userId: string): (typeof AVATAR_PALETTE)[number] {
  return AVATAR_PALETTE[hashToIndex(userId, AVATAR_PALETTE.length)] ?? AVATAR_PALETTE[0];
}

function getInitial(username: string): string {
  return username.charAt(0).toUpperCase() || '?';
}

interface AvatarCircleProps {
  userId: string;
  username: string;
  avatarUrl?: string | null;
  isFirst: boolean;
}

function AvatarCircle({ userId, username, avatarUrl, isFirst }: AvatarCircleProps) {
  const palette = getAvatarPalette(userId);

  return (
    <span
      className={`relative inline-flex items-center justify-center w-[26px] h-[26px] rounded-full text-[11px] font-semibold shrink-0 border-2 border-surface ${palette.bg} ${palette.fg}`}
      style={{ marginRight: isFirst ? '0' : '-8px' }}
      role="img"
      title={username}
      aria-label={`${username}, online`}
    >
      {avatarUrl ? (
        <img src={avatarUrl} alt={username} className="w-full h-full rounded-full object-cover" />
      ) : (
        <span aria-hidden="true">{getInitial(username)}</span>
      )}
      <span
        className="absolute -bottom-px -right-px w-2 h-2 rounded-full bg-success border-2 border-surface"
        aria-hidden="true"
      />
    </span>
  );
}

export interface AvatarStackProps {
  participants: Array<{
    userId: string;
    username: string;
    avatarUrl?: string | null;
  }>;
  maxVisible?: number;
}

export function AvatarStack({ participants, maxVisible = 3 }: AvatarStackProps) {
  if (participants.length === 0) return null;

  const visible = participants.slice(0, maxVisible);
  const overflow = participants.length - maxVisible;

  return (
    <div
      className="flex items-center mr-1"
      style={{ flexDirection: 'row-reverse' }}
      role="group"
      aria-label={`${participants.length} participant${participants.length === 1 ? '' : 's'} online`}
    >
      {[...visible].reverse().map((p, i) => (
        <AvatarCircle
          key={p.userId}
          userId={p.userId}
          username={p.username}
          avatarUrl={p.avatarUrl}
          isFirst={i === 0}
        />
      ))}
      {overflow > 0 && (
        <span
          role="img"
          className="inline-flex items-center justify-center w-[26px] h-[26px] rounded-full bg-default text-[10px] font-medium text-muted shrink-0 border-2 border-surface"
          style={{ marginRight: '-8px' }}
          aria-label={`${overflow} more participant${overflow === 1 ? '' : 's'}`}
        >
          +{overflow}
        </span>
      )}
    </div>
  );
}
