import type { WebRtcDataChannelAdapter } from '@loro-extended/adapter-webrtc';
import type { PeerID } from '@loro-extended/repo';
import type {
  CollabRoomConnection,
  CollabRoomServerMessage,
  ConnectionState,
} from '@shipyard/session';
import { useEffect, useRef, useState } from 'react';

export type PeerState = 'idle' | 'connecting' | 'connected' | 'failed';

const ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

function toPeerID(userId: string): PeerID {
  // eslint-disable-next-line no-restricted-syntax -- PeerID is branded `${number}` but we use string user IDs as opaque adapter Map keys
  return userId as PeerID;
}

export interface UseCollabWebRTCSyncProps {
  connection: CollabRoomConnection | null;
  collabAdapter: WebRtcDataChannelAdapter | null;
  connectionState: ConnectionState;
  currentUserId: string | null;
  initialParticipants: { userId: string }[];
}

interface PeerEntry {
  pc: RTCPeerConnection;
  dataChannel: RTCDataChannel | null;
  retryTimer: ReturnType<typeof setTimeout> | undefined;
}

/**
 * Multi-peer WebRTC sync hook for collab rooms.
 *
 * Maintains one RTCPeerConnection per remote participant (keyed by userId).
 * When a NEW participant appears (not self), existing participants send offers
 * to the new participant. The new participant responds with answers. This avoids
 * both sides sending offers simultaneously.
 *
 * Signaling relay note: the collab room DO swaps `targetUserId` during relay.
 * When client A sends `{ targetUserId: 'B' }`, client B receives
 * `{ targetUserId: 'A' }`. So on received messages, `targetUserId` identifies
 * the SENDER, not the target.
 */
export function useCollabWebRTCSync(props: UseCollabWebRTCSyncProps): {
  peerStates: Map<string, PeerState>;
} {
  const { connection, collabAdapter, connectionState, currentUserId, initialParticipants } = props;
  const [peerStates, setPeerStates] = useState<Map<string, PeerState>>(new Map());
  const peersRef = useRef(new Map<string, PeerEntry>());
  const runIdRef = useRef(0);
  const getOrCreatePeerRef = useRef<((userId: string, isInitiator: boolean) => PeerEntry) | null>(
    null
  );
  const initialParticipantsRef = useRef(initialParticipants);
  initialParticipantsRef.current = initialParticipants;

  useEffect(() => {
    const thisRunId = ++runIdRef.current;

    if (!connection || !collabAdapter || !currentUserId || connectionState !== 'connected') {
      closeAllPeers(peersRef.current, collabAdapter);
      peersRef.current.clear();
      setPeerStates(new Map());
      return;
    }

    const updatePeerState = (userId: string, state: PeerState) => {
      if (runIdRef.current !== thisRunId) return;
      setPeerStates((prev) => {
        const next = new Map(prev);
        if (state === 'idle') {
          next.delete(userId);
        } else {
          next.set(userId, state);
        }
        return next;
      });
    };

    const createPeerConnection = (remoteUserId: string, isInitiator: boolean): PeerEntry => {
      const peerId = toPeerID(remoteUserId);
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      const entry: PeerEntry = { pc, dataChannel: null, retryTimer: undefined };

      updatePeerState(remoteUserId, 'connecting');

      if (isInitiator) {
        const dataChannel = pc.createDataChannel('loro-sync', { ordered: true });
        entry.dataChannel = dataChannel;

        dataChannel.addEventListener('open', () => {
          if (runIdRef.current !== thisRunId) return;
          tryAttachChannel(
            collabAdapter,
            peerId,
            dataChannel,
            entry,
            remoteUserId,
            updatePeerState
          );
        });

        dataChannel.addEventListener('close', () => {
          if (runIdRef.current !== thisRunId) return;
          collabAdapter.detachDataChannel(peerId);
          updatePeerState(remoteUserId, 'idle');
        });

        dataChannel.addEventListener('error', () => {
          if (runIdRef.current !== thisRunId) return;
          collabAdapter.detachDataChannel(peerId);
          updatePeerState(remoteUserId, 'failed');
        });
      }

      pc.addEventListener('datachannel', (event) => {
        if (runIdRef.current !== thisRunId) return;
        const channel = event.channel;
        if (channel.label !== 'loro-sync') return;

        entry.dataChannel = channel;

        channel.addEventListener('open', () => {
          if (runIdRef.current !== thisRunId) return;
          tryAttachChannel(collabAdapter, peerId, channel, entry, remoteUserId, updatePeerState);
        });

        channel.addEventListener('close', () => {
          if (runIdRef.current !== thisRunId) return;
          collabAdapter.detachDataChannel(peerId);
          updatePeerState(remoteUserId, 'idle');
        });

        channel.addEventListener('error', () => {
          if (runIdRef.current !== thisRunId) return;
          collabAdapter.detachDataChannel(peerId);
          updatePeerState(remoteUserId, 'failed');
        });

        if (channel.readyState === 'open') {
          tryAttachChannel(collabAdapter, peerId, channel, entry, remoteUserId, updatePeerState);
        }
      });

      pc.addEventListener('icecandidate', (event) => {
        if (runIdRef.current !== thisRunId || !event.candidate) return;
        connection.send({
          type: 'webrtc-ice',
          targetUserId: remoteUserId,
          candidate: event.candidate.toJSON(),
        });
      });

      pc.addEventListener('connectionstatechange', () => {
        if (runIdRef.current !== thisRunId) return;
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
          collabAdapter.detachDataChannel(peerId);
          updatePeerState(remoteUserId, 'failed');
        }
      });

      if (isInitiator) {
        pc.createOffer()
          .then((offer) => pc.setLocalDescription(offer).then(() => offer))
          .then((offer) => {
            if (runIdRef.current !== thisRunId) return;
            connection.send({
              type: 'webrtc-offer',
              targetUserId: remoteUserId,
              offer,
            });
          })
          .catch(() => {
            if (runIdRef.current === thisRunId) updatePeerState(remoteUserId, 'failed');
          });
      }

      return entry;
    };

    const getOrCreatePeer = (remoteUserId: string, isInitiator: boolean): PeerEntry => {
      const existing = peersRef.current.get(remoteUserId);
      if (existing) return existing;

      const entry = createPeerConnection(remoteUserId, isInitiator);
      peersRef.current.set(remoteUserId, entry);
      return entry;
    };

    const handleOffer = (msg: CollabRoomServerMessage & { type: 'webrtc-offer' }) => {
      /**
       * After relay, `targetUserId` is the SENDER's userId (the DO swaps it).
       * See collab-room.ts handleWebRTCRelay().
       *
       * If a peer already exists (e.g., from a previous offer due to
       * StrictMode double-invoke or re-negotiation), tear it down and
       * create a fresh connection to avoid corrupted SDP state.
       */
      const fromUserId = msg.targetUserId;
      const existing = peersRef.current.get(fromUserId);
      if (existing) {
        closePeerEntry(existing, fromUserId, collabAdapter);
        peersRef.current.delete(fromUserId);
      }
      const entry = createPeerConnection(fromUserId, false);
      peersRef.current.set(fromUserId, entry);

      // eslint-disable-next-line no-restricted-syntax -- WebRTC payloads are opaque (z.unknown) bridged to browser WebRTC API
      const sdp = msg.offer as RTCSessionDescriptionInit;
      entry.pc
        .setRemoteDescription(new RTCSessionDescription(sdp))
        .then(() => entry.pc.createAnswer())
        .then((answer) => entry.pc.setLocalDescription(answer).then(() => answer))
        .then((answer) => {
          if (runIdRef.current !== thisRunId) return;
          connection.send({
            type: 'webrtc-answer',
            targetUserId: fromUserId,
            answer,
          });
        })
        .catch(() => {
          if (runIdRef.current === thisRunId) updatePeerState(fromUserId, 'failed');
        });
    };

    const handleAnswer = (msg: CollabRoomServerMessage & { type: 'webrtc-answer' }) => {
      const fromUserId = msg.targetUserId;
      const entry = peersRef.current.get(fromUserId);
      if (!entry) return;

      // eslint-disable-next-line no-restricted-syntax -- WebRTC payloads are opaque (z.unknown) bridged to browser WebRTC API
      const answer = msg.answer as RTCSessionDescriptionInit;
      entry.pc.setRemoteDescription(new RTCSessionDescription(answer)).catch(() => {
        if (runIdRef.current === thisRunId) updatePeerState(fromUserId, 'failed');
      });
    };

    const handleIce = (msg: CollabRoomServerMessage & { type: 'webrtc-ice' }) => {
      const fromUserId = msg.targetUserId;
      const entry = peersRef.current.get(fromUserId);
      if (!entry) return;

      // eslint-disable-next-line no-restricted-syntax -- WebRTC payloads are opaque (z.unknown) bridged to browser WebRTC API
      const candidate = msg.candidate as RTCIceCandidateInit;
      entry.pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {
        /** ICE candidate may arrive after connection is closed */
      });
    };

    const handleParticipantsList = (
      msg: CollabRoomServerMessage & { type: 'participants-list' }
    ) => {
      /**
       * Server sends 'participants-list' once after authentication with the
       * full list of already-present participants. Create peer connections
       * for each remote participant, using a deterministic tiebreaker to
       * decide who initiates (lexicographically smaller userId sends the offer).
       */
      for (const participant of msg.participants) {
        if (participant.userId === currentUserId) continue;
        if (peersRef.current.has(participant.userId)) continue;

        const shouldInitiate = currentUserId < participant.userId;
        getOrCreatePeer(participant.userId, shouldInitiate);
      }
    };

    const handleParticipantJoined = (
      msg: CollabRoomServerMessage & { type: 'participant-joined' }
    ) => {
      if (msg.participant.userId !== currentUserId) {
        getOrCreatePeer(msg.participant.userId, true);
      }
    };

    const handleParticipantLeft = (msg: CollabRoomServerMessage & { type: 'participant-left' }) => {
      const entry = peersRef.current.get(msg.userId);
      if (!entry) return;
      closePeerEntry(entry, msg.userId, collabAdapter);
      peersRef.current.delete(msg.userId);
      updatePeerState(msg.userId, 'idle');
    };

    const unsubMessage = connection.onMessage((msg: CollabRoomServerMessage) => {
      if (runIdRef.current !== thisRunId) return;

      switch (msg.type) {
        case 'webrtc-offer':
          handleOffer(msg);
          break;
        case 'webrtc-answer':
          handleAnswer(msg);
          break;
        case 'webrtc-ice':
          handleIce(msg);
          break;
        case 'participants-list':
          handleParticipantsList(msg);
          break;
        case 'participant-joined':
          handleParticipantJoined(msg);
          break;
        case 'participant-left':
          handleParticipantLeft(msg);
          break;
        default:
          break;
      }
    });

    for (const participant of initialParticipantsRef.current) {
      if (participant.userId === currentUserId) continue;
      if (peersRef.current.has(participant.userId)) continue;
      const shouldInitiate = currentUserId < participant.userId;
      getOrCreatePeer(participant.userId, shouldInitiate);
    }

    getOrCreatePeerRef.current = getOrCreatePeer;

    return () => {
      unsubMessage();
      closeAllPeers(peersRef.current, collabAdapter);
      peersRef.current.clear();
      setPeerStates(new Map());
    };
  }, [connection, collabAdapter, connectionState, currentUserId]);

  /**
   * When participants arrive after the main effect has already run (common
   * because participants-list is consumed by useCollabRoom before the WebRTC
   * effect subscribes), create peers for any new participants.
   */
  useEffect(() => {
    if (!currentUserId || !getOrCreatePeerRef.current) return;
    for (const participant of initialParticipants) {
      if (participant.userId === currentUserId) continue;
      if (peersRef.current.has(participant.userId)) continue;
      const shouldInitiate = currentUserId < participant.userId;
      getOrCreatePeerRef.current(participant.userId, shouldInitiate);
    }
  }, [initialParticipants, currentUserId]);

  return { peerStates };
}

function tryAttachChannel(
  adapter: WebRtcDataChannelAdapter,
  peerId: PeerID,
  channel: RTCDataChannel,
  entry: PeerEntry,
  remoteUserId: string,
  updatePeerState: (userId: string, state: PeerState) => void,
  retriesLeft = 15
): void {
  try {
    adapter.attachDataChannel(peerId, channel);
    updatePeerState(remoteUserId, 'connected');
  } catch {
    if (retriesLeft > 0) {
      entry.retryTimer = setTimeout(
        () =>
          tryAttachChannel(
            adapter,
            peerId,
            channel,
            entry,
            remoteUserId,
            updatePeerState,
            retriesLeft - 1
          ),
        200
      );
    } else {
      updatePeerState(remoteUserId, 'failed');
    }
  }
}

function closePeerEntry(
  entry: PeerEntry,
  userId: string,
  adapter: WebRtcDataChannelAdapter | null
): void {
  clearTimeout(entry.retryTimer);
  if (adapter) {
    adapter.detachDataChannel(toPeerID(userId));
  }
  if (entry.dataChannel) {
    entry.dataChannel.close();
  }
  entry.pc.close();
}

function closeAllPeers(
  peers: Map<string, PeerEntry>,
  adapter: WebRtcDataChannelAdapter | null
): void {
  for (const [userId, entry] of peers) {
    closePeerEntry(entry, userId, adapter);
  }
}
