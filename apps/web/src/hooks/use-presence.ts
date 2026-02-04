import type { PeerPresence } from '@shipyard/loro-schema';
import { useEffect, useRef } from 'react';
import { INTERVALS } from '@/constants/timings';
import { useRoomHandle } from '@/loro/selectors/room-selectors';

function generatePeerColor(): string {
  const colors = [
    '#FF6B6B',
    '#FF9F43',
    '#FFEAA7',
    '#26DE81',
    '#4ECDC4',
    '#54A0FF',
    '#A55EEA',
    '#FFB8D0',
    '#2D3436',
  ] as const;
  const index = Math.floor(Math.random() * colors.length);
  return colors[index] ?? '#888888';
}

function detectBrowser(): string | null {
  const ua = navigator.userAgent;
  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('Edg')) return 'Edge';
  if (ua.includes('Chrome')) return 'Chrome';
  if (ua.includes('Safari')) return 'Safari';
  if (ua.includes('Opera') || ua.includes('OPR')) return 'Opera';
  return null;
}

function detectOS(): string | null {
  const ua = navigator.userAgent;
  if (ua.includes('iPhone') || ua.includes('iPad')) return 'iOS';
  if (ua.includes('Android')) return 'Android';
  if (ua.includes('Mac')) return 'macOS';
  if (ua.includes('Win')) return 'Windows';
  if (ua.includes('Linux')) return 'Linux';
  return null;
}

interface UsePresenceOptions {
  name: string;
  isOwner?: boolean;
  hasDaemon?: boolean;
}

export function usePresence(options: UsePresenceOptions): void {
  const roomHandle = useRoomHandle();
  const colorRef = useRef<string | null>(null);

  if (colorRef.current === null) {
    colorRef.current = generatePeerColor();
  }

  useEffect(() => {
    const presence: PeerPresence = {
      name: options.name,
      color: colorRef.current ?? '#888888',
      platform: 'browser',
      isOwner: options.isOwner ?? false,
      connectedAt: Date.now(),
      hasDaemon: options.hasDaemon ?? false,
      context: null,
      browserContext: {
        browser: detectBrowser(),
        os: detectOS(),
        lastActive: Date.now(),
      },
    };

    roomHandle.presence.setSelf(presence);

    const interval = setInterval(() => {
      const current = roomHandle.presence.self;
      if (current?.browserContext) {
        roomHandle.presence.setSelf({
          ...current,
          browserContext: {
            ...current.browserContext,
            lastActive: Date.now(),
          },
        });
      }
    }, INTERVALS.PRESENCE_HEARTBEAT);

    return () => {
      clearInterval(interval);
    };
  }, [roomHandle, options.name, options.isOwner, options.hasDaemon]);
}
