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
  onTerminalChannel?: (machineId: string, channel: unknown) => void;
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

  function setupPeerHandlers(machineId: string, pc: MinimalPeerConnection): void {
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
      // eslint-disable-next-line no-restricted-syntax -- node-datachannel channel type is opaque
      const channel = event.channel as { label?: string };
      if (channel.label === 'terminal-io') {
        logger.info({ machineId }, 'Terminal data channel received');
        config.onTerminalChannel?.(machineId, event.channel);
      } else {
        logger.info({ machineId }, 'Data channel received from browser');
        // eslint-disable-next-line no-restricted-syntax -- RTCDataChannel from node-datachannel satisfies the adapter interface
        config.webrtcAdapter.attachDataChannel(
          machineIdToPeerId(machineId),
          event.channel as never
        );
        logger.info({ machineId }, 'Data channel attached to Loro adapter');
      }
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      logger.info({ machineId, state }, 'Peer connection state changed');

      if (state === 'failed' || state === 'closed') {
        config.webrtcAdapter.detachDataChannel(machineIdToPeerId(machineId));
        peers.delete(machineId);
        pc.close();
      }
    };

    // eslint-disable-next-line no-restricted-syntax -- node-datachannel polyfill supports these handlers
    (pc as unknown as { onsignalingstatechange: (() => void) | null }).onsignalingstatechange =
      () => {
        // eslint-disable-next-line no-restricted-syntax -- reading state from underlying connection
        const sigState = (pc as unknown as { signalingState: string }).signalingState;
        logger.info({ machineId, signalingState: sigState }, 'Signaling state changed');
      };

    /* eslint-disable no-restricted-syntax -- node-datachannel polyfill requires these casts */
    (
      pc as unknown as { onicegatheringstatechange: (() => void) | null }
    ).onicegatheringstatechange = () => {
      const iceState = (pc as unknown as { iceGatheringState: string }).iceGatheringState;
      /* eslint-enable no-restricted-syntax */
      logger.info({ machineId, iceGatheringState: iceState }, 'ICE gathering state changed');
    };
  }

  return {
    async handleOffer(fromMachineId, offer) {
      logger.info({ fromMachineId }, 'Handling WebRTC offer');
      const existing = peers.get(fromMachineId);
      if (existing) {
        logger.debug({ fromMachineId }, 'Closing existing peer connection');
        existing.close();
        peers.delete(fromMachineId);
      }

      const promise = (async () => {
        const factory = await getFactory();
        const pc = factory();
        logger.debug({ fromMachineId }, 'Created peer connection');
        setupPeerHandlers(fromMachineId, pc);
        logger.debug({ fromMachineId }, 'Setting remote description (offer)');
        await pc.setRemoteDescription(offer);
        logger.debug({ fromMachineId }, 'Creating answer');
        const answer = await pc.createAnswer();
        logger.debug(
          { fromMachineId, hasAnswerSdp: !!answer.sdp },
          'Setting local description (answer)'
        );
        await pc.setLocalDescription(answer);
        peers.set(fromMachineId, pc);
        pendingCreates.delete(fromMachineId);
        logger.info({ fromMachineId }, 'Sending WebRTC answer');
        config.onAnswer(fromMachineId, { type: 'answer', sdp: answer.sdp });
        return pc;
      })();

      pendingCreates.set(fromMachineId, promise);

      const HANDSHAKE_TIMEOUT_MS = 30_000;
      setTimeout(() => {
        if (pendingCreates.get(fromMachineId) === promise) {
          pendingCreates.delete(fromMachineId);
          logger.warn({ fromMachineId }, 'WebRTC handshake timed out');
        }
      }, HANDSHAKE_TIMEOUT_MS);

      await promise;
    },

    async handleAnswer(fromMachineId, answer) {
      logger.debug({ fromMachineId }, 'Handling WebRTC answer');
      let pc = peers.get(fromMachineId);
      if (!pc) {
        const pending = pendingCreates.get(fromMachineId);
        if (pending) {
          pc = await pending;
        } else {
          logger.warn({ fromMachineId }, 'Received answer for unknown peer');
          return;
        }
      }
      await pc.setRemoteDescription(answer);
      logger.debug({ fromMachineId }, 'Remote description (answer) set');
    },

    async handleIce(fromMachineId, candidate) {
      logger.debug({ fromMachineId }, 'Handling WebRTC ICE candidate');
      let pc = peers.get(fromMachineId);
      if (!pc) {
        const pending = pendingCreates.get(fromMachineId);
        if (pending) {
          pc = await pending;
        } else {
          logger.warn({ fromMachineId }, 'Received ICE candidate for unknown peer');
          return;
        }
      }
      await pc.addIceCandidate(candidate);
      logger.debug({ fromMachineId }, 'ICE candidate added');
    },

    destroy() {
      for (const [machineId, pc] of peers) {
        config.webrtcAdapter.detachDataChannel(machineIdToPeerId(machineId));
        pc.close();
      }
      peers.clear();
      pendingCreates.clear();
    },
  };
}
