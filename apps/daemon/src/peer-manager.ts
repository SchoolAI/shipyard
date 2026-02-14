import type { WebRtcDataChannelAdapter } from '@loro-extended/adapter-webrtc';
import type { PeerID } from 'loro-crdt';
import { logger } from './logger.js';

const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

/** SDP offer/answer passed over the signaling channel. */
export interface SDPDescription {
  type: 'offer' | 'answer';
  sdp?: string;
}

/** ICE candidate passed over the signaling channel. */
export interface ICECandidate {
  candidate?: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
}

/** Minimal interface for a peer connection (subset of RTCPeerConnection). */
export interface MinimalPeerConnection {
  connectionState: string;
  onicecandidate:
    | ((ev: {
        candidate: {
          candidate: string;
          sdpMid: string | null;
          sdpMLineIndex: number | null;
        } | null;
      }) => void)
    | null;
  ondatachannel: ((ev: { channel: unknown }) => void) | null;
  onconnectionstatechange: (() => void) | null;
  setRemoteDescription(desc: SDPDescription): Promise<void>;
  createAnswer(): Promise<SDPDescription>;
  setLocalDescription(desc: SDPDescription): Promise<void>;
  addIceCandidate(candidate: ICECandidate): Promise<void>;
  close(): void;
}

export interface PeerManagerConfig {
  webrtcAdapter: WebRtcDataChannelAdapter;
  onAnswer: (targetMachineId: string, answer: SDPDescription) => void;
  onIceCandidate: (targetMachineId: string, candidate: ICECandidate) => void;
  /** Factory to create peer connections. Defaults to node-datachannel/polyfill. */
  createPeerConnection?: () => MinimalPeerConnection;
}

export interface PeerManager {
  handleOffer(fromMachineId: string, offer: SDPDescription): Promise<void>;
  handleAnswer(fromMachineId: string, answer: SDPDescription): Promise<void>;
  handleIce(fromMachineId: string, candidate: ICECandidate): Promise<void>;
  destroy(): void;
}

function machineIdToPeerId(machineId: string): PeerID {
  // eslint-disable-next-line no-restricted-syntax -- PeerID is `${number}` branded but adapter uses it as opaque string key
  return machineId as unknown as PeerID;
}

/** Default factory that uses node-datachannel/polyfill. */
async function loadDefaultFactory(): Promise<() => MinimalPeerConnection> {
  const { RTCPeerConnection } = await import('node-datachannel/polyfill');
  return () => {
    // eslint-disable-next-line no-restricted-syntax -- node-datachannel config is compatible
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS } as never);
    // eslint-disable-next-line no-restricted-syntax -- MinimalPeerConnection subset
    return pc as unknown as MinimalPeerConnection;
  };
}

export function createPeerManager(config: PeerManagerConfig): PeerManager {
  const peers = new Map<string, MinimalPeerConnection>();
  const pendingCreates = new Map<string, Promise<MinimalPeerConnection>>();
  let factoryPromise: Promise<() => MinimalPeerConnection> | null = null;

  async function getFactory(): Promise<() => MinimalPeerConnection> {
    if (config.createPeerConnection) {
      return config.createPeerConnection;
    }
    if (!factoryPromise) {
      factoryPromise = loadDefaultFactory();
    }
    return factoryPromise;
  }

  async function getOrCreatePeer(machineId: string): Promise<MinimalPeerConnection> {
    const existing = peers.get(machineId);
    if (existing) return existing;

    const pending = pendingCreates.get(machineId);
    if (pending) return pending;

    const promise = createPeer(machineId);
    pendingCreates.set(machineId, promise);
    return promise;
  }

  async function createPeer(machineId: string): Promise<MinimalPeerConnection> {
    const factory = await getFactory();
    const pc = factory();

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        config.onIceCandidate(machineId, {
          candidate: event.candidate.candidate,
          sdpMid: event.candidate.sdpMid,
          sdpMLineIndex: event.candidate.sdpMLineIndex,
        });
      }
    };

    pc.ondatachannel = (event) => {
      logger.debug({ machineId }, 'Data channel received');
      // eslint-disable-next-line no-restricted-syntax -- RTCDataChannel from node-datachannel satisfies the adapter interface
      config.webrtcAdapter.attachDataChannel(machineIdToPeerId(machineId), event.channel as never);
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      logger.debug({ machineId, state }, 'Peer connection state changed');

      if (state === 'failed' || state === 'closed') {
        config.webrtcAdapter.detachDataChannel(machineIdToPeerId(machineId));
        peers.delete(machineId);
        pc.close();
      }
    };

    peers.set(machineId, pc);
    pendingCreates.delete(machineId);
    return pc;
  }

  return {
    async handleOffer(fromMachineId, offer) {
      const pc = await getOrCreatePeer(fromMachineId);
      await pc.setRemoteDescription(offer);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      config.onAnswer(fromMachineId, { type: 'answer', sdp: answer.sdp });
    },

    async handleAnswer(fromMachineId, answer) {
      const pc = peers.get(fromMachineId);
      if (!pc) {
        logger.warn({ fromMachineId }, 'Received answer for unknown peer');
        return;
      }
      await pc.setRemoteDescription(answer);
    },

    async handleIce(fromMachineId, candidate) {
      const pc = peers.get(fromMachineId);
      if (!pc) {
        logger.warn({ fromMachineId }, 'Received ICE candidate for unknown peer');
        return;
      }
      await pc.addIceCandidate(candidate);
    },

    destroy() {
      for (const [machineId, pc] of peers) {
        config.webrtcAdapter.detachDataChannel(machineIdToPeerId(machineId));
        pc.close();
      }
      peers.clear();
    },
  };
}
