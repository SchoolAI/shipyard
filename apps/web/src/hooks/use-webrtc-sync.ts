import type { WebRtcDataChannelAdapter } from '@loro-extended/adapter-webrtc';
import type { PeerID } from '@loro-extended/repo';
import type { PersonalRoomConnection, PersonalRoomServerMessage } from '@shipyard/session';
import { useEffect, useState } from 'react';

export type PeerState = 'idle' | 'connecting' | 'connected' | 'failed';

const ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

export function useWebRTCSync(options: {
  connection: PersonalRoomConnection | null;
  webrtcAdapter: WebRtcDataChannelAdapter | null;
  targetMachineId: string | null;
}): { peerState: PeerState } {
  const { connection, webrtcAdapter, targetMachineId } = options;
  const [peerState, setPeerState] = useState<PeerState>('idle');

  useEffect(() => {
    if (!connection || !webrtcAdapter || !targetMachineId) {
      setPeerState('idle');
      return;
    }

    // eslint-disable-next-line no-restricted-syntax -- PeerID is branded `${number}` but we use string machine IDs as opaque keys
    const peerId = targetMachineId as PeerID;
    let disposed = false;
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const dataChannel = pc.createDataChannel('loro-sync', { ordered: true });

    setPeerState('connecting');

    dataChannel.addEventListener('open', () => {
      if (disposed) return;
      webrtcAdapter.attachDataChannel(peerId, dataChannel);
      setPeerState('connected');
    });

    dataChannel.addEventListener('close', () => {
      if (disposed) return;
      webrtcAdapter.detachDataChannel(peerId);
      setPeerState('idle');
    });

    dataChannel.addEventListener('error', () => {
      if (disposed) return;
      webrtcAdapter.detachDataChannel(peerId);
      setPeerState('failed');
    });

    pc.addEventListener('icecandidate', (event) => {
      if (disposed || !event.candidate) return;
      connection.send({
        type: 'webrtc-ice',
        targetMachineId,
        candidate: event.candidate.toJSON(),
      });
    });

    pc.addEventListener('connectionstatechange', () => {
      if (disposed) return;
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        webrtcAdapter.detachDataChannel(peerId);
        setPeerState('failed');
      }
    });

    const unsubMessage = connection.onMessage((msg: PersonalRoomServerMessage) => {
      if (disposed) return;

      if (
        msg.type === 'webrtc-answer' &&
        (msg.fromMachineId === targetMachineId || msg.targetMachineId === targetMachineId)
      ) {
        // eslint-disable-next-line no-restricted-syntax -- WebRTC payloads are opaque (z.unknown) bridged to browser WebRTC API
        const answer = msg.answer as RTCSessionDescriptionInit;
        pc.setRemoteDescription(new RTCSessionDescription(answer)).catch(() => {
          if (!disposed) setPeerState('failed');
        });
      }

      if (
        msg.type === 'webrtc-ice' &&
        (msg.fromMachineId === targetMachineId || msg.targetMachineId === targetMachineId)
      ) {
        // eslint-disable-next-line no-restricted-syntax -- WebRTC payloads are opaque (z.unknown) bridged to browser WebRTC API
        const candidate = msg.candidate as RTCIceCandidateInit;
        pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {
          /** ICE candidate may arrive after connection is closed */
        });
      }
    });

    pc.createOffer()
      .then((offer) => pc.setLocalDescription(offer).then(() => offer))
      .then((offer) => {
        if (disposed) return;
        connection.send({
          type: 'webrtc-offer',
          targetMachineId,
          offer,
        });
      })
      .catch(() => {
        if (!disposed) setPeerState('failed');
      });

    return () => {
      disposed = true;
      unsubMessage();
      webrtcAdapter.detachDataChannel(peerId);
      dataChannel.close();
      pc.close();
      setPeerState('idle');
    };
  }, [connection, webrtcAdapter, targetMachineId]);

  return { peerState };
}
