import { WebRtcDataChannelAdapter } from '@loro-extended/adapter-webrtc';
import type { PeerID } from '@loro-extended/repo';
import type { PersonalRoomClientMessage, PersonalRoomServerMessage } from '@shipyard/session';
import { nanoid } from 'nanoid';
import { createLogger } from '@/utils/logger';

const log = createLogger('WebRTC');

function getIceServers(): RTCIceServer[] {
  const iceServers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];

  const turnUrl = import.meta.env.VITE_TURN_URL;
  const turnUsername = import.meta.env.VITE_TURN_USERNAME;
  const turnCredential = import.meta.env.VITE_TURN_CREDENTIAL;

  if (turnUrl && turnUsername && turnCredential) {
    iceServers.push({
      urls: turnUrl,
      username: turnUsername,
      credential: turnCredential,
    });
  }

  return iceServers;
}

function getSignalingUrl(): string {
  if (import.meta.env.MODE === 'production') {
    return 'wss://shipyard-session-server.jacob-191.workers.dev';
  }
  return import.meta.env.VITE_WEBRTC_SIGNALING || 'ws://localhost:4444';
}

interface TrackedPeerConnection {
  pc: RTCPeerConnection;
  dataChannel: RTCDataChannel | null;
  remotePeerId: PeerID;
  cleanupAdapter: (() => void) | null;
}

export class WebRtcSyncManager {
  private adapter: WebRtcDataChannelAdapter;
  private signalingWs: WebSocket | null = null;
  private peerConnections = new Map<string, TrackedPeerConnection>();
  private machineId: string;
  private userId: string | null = null;
  private token: string | null = null;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 10;
  private readonly baseReconnectDelay = 1000;
  private isDestroyed = false;

  constructor() {
    this.adapter = new WebRtcDataChannelAdapter();
    this.machineId = this.getOrCreateMachineId();
  }

  private getOrCreateMachineId(): string {
    const key = 'shipyard-machine-id';
    let machineId = localStorage.getItem(key);
    if (!machineId) {
      machineId = `browser-${nanoid()}`;
      localStorage.setItem(key, machineId);
    }
    return machineId;
  }

  getAdapter(): WebRtcDataChannelAdapter {
    return this.adapter;
  }

  getMachineId(): string {
    return this.machineId;
  }

  connect(userId: string, token: string): void {
    if (this.isDestroyed) return;

    this.userId = userId;
    this.token = token;

    const signalingUrl = getSignalingUrl();
    const wsUrl = `${signalingUrl.replace(/^http/, 'ws')}/personal/${encodeURIComponent(userId)}?token=${encodeURIComponent(token)}`;

    this.signalingWs = new WebSocket(wsUrl);

    this.signalingWs.onopen = () => {
      log.info('Connected to signaling server');
      this.reconnectAttempts = 0;
    };

    this.signalingWs.onmessage = (event) => {
      this.handleSignalingMessage(event.data);
    };

    this.signalingWs.onclose = (event) => {
      log.info('Signaling connection closed', {
        code: event.code,
        reason: event.reason,
      });
      this.scheduleReconnect();
    };

    this.signalingWs.onerror = (error) => {
      log.error('Signaling connection error', error);
    };
  }

  disconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.signalingWs) {
      this.signalingWs.close();
      this.signalingWs = null;
    }

    for (const peerId of this.peerConnections.keys()) {
      this.closePeerConnection(peerId);
    }
    this.peerConnections.clear();
  }

  destroy(): void {
    this.isDestroyed = true;
    this.disconnect();
  }

  async connectToPeer(targetMachineId: string): Promise<void> {
    if (!this.signalingWs || this.signalingWs.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected to signaling server');
    }

    if (targetMachineId === this.machineId) {
      log.warn('Ignoring connection to self');
      return;
    }

    if (this.peerConnections.has(targetMachineId)) {
      log.debug('Already connected to', targetMachineId);
      return;
    }

    log.info('Initiating connection to', targetMachineId);

    const pc = this.createPeerConnection(targetMachineId);
    const tracked: TrackedPeerConnection = {
      pc,
      dataChannel: null,
      remotePeerId: targetMachineId as PeerID,
      cleanupAdapter: null,
    };
    this.peerConnections.set(targetMachineId, tracked);

    const dataChannel = pc.createDataChannel('loro-sync', { ordered: true });
    tracked.dataChannel = dataChannel;
    this.setupDataChannel(targetMachineId, dataChannel);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    const msg: PersonalRoomClientMessage = {
      type: 'webrtc-offer',
      targetMachineId,
      offer: pc.localDescription,
      requestId: nanoid(),
    };
    this.sendSignalingMessage(msg);
  }

  private createPeerConnection(remoteMachineId: string): RTCPeerConnection {
    const pc = new RTCPeerConnection({
      iceServers: getIceServers(),
    });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        const msg: PersonalRoomClientMessage = {
          type: 'webrtc-ice',
          targetMachineId: remoteMachineId,
          candidate: event.candidate.toJSON(),
        };
        this.sendSignalingMessage(msg);
      }
    };

    pc.oniceconnectionstatechange = () => {
      log.debug(`ICE state for ${remoteMachineId}:`, pc.iceConnectionState);
      if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
        this.closePeerConnection(remoteMachineId);
      }
    };

    pc.ondatachannel = (event) => {
      if (event.channel.label === 'loro-sync') {
        const tracked = this.peerConnections.get(remoteMachineId);
        if (tracked) {
          tracked.dataChannel = event.channel;
          this.setupDataChannel(remoteMachineId, event.channel);
        }
      }
    };

    return pc;
  }

  private setupDataChannel(remoteMachineId: string, dataChannel: RTCDataChannel): void {
    const tracked = this.peerConnections.get(remoteMachineId);
    if (!tracked) return;

    dataChannel.onopen = () => {
      log.info(`Data channel open with ${remoteMachineId}`);
      tracked.cleanupAdapter = this.adapter.attachDataChannel(
        remoteMachineId as PeerID,
        dataChannel
      );
    };

    dataChannel.onclose = () => {
      log.info(`Data channel closed with ${remoteMachineId}`);
      if (tracked.cleanupAdapter) {
        tracked.cleanupAdapter();
        tracked.cleanupAdapter = null;
      }
    };

    dataChannel.onerror = (error) => {
      log.error(`Data channel error with ${remoteMachineId}:`, error);
    };
  }

  private handleSignalingMessage(data: string): void {
    let msg: PersonalRoomServerMessage;
    try {
      msg = JSON.parse(data);
    } catch {
      log.warn('Invalid signaling message:', data);
      return;
    }

    switch (msg.type) {
      case 'authenticated':
        log.info('Authenticated as', msg.userId);
        break;

      case 'agents-list':
        for (const agent of msg.agents) {
          if (agent.machineId !== this.machineId) {
            this.connectToPeer(agent.machineId).catch((err) =>
              log.error('Failed to connect to peer', err)
            );
          }
        }
        break;

      case 'agent-joined':
        if (msg.agent.machineId !== this.machineId) {
          this.connectToPeer(msg.agent.machineId).catch((err) =>
            log.error('Failed to connect to peer', err)
          );
        }
        break;

      case 'agent-left':
        log.info('Agent left:', msg.agentId);
        break;

      case 'webrtc-offer':
        this.handleWebRtcOffer(msg);
        break;

      case 'webrtc-answer':
        this.handleWebRtcAnswer(msg);
        break;

      case 'webrtc-ice':
        this.handleWebRtcIce(msg);
        break;

      case 'error':
        log.error('Signaling error:', msg.code, msg.message);
        break;

      default:
        break;
    }
  }

  private async handleWebRtcOffer(
    msg: Extract<PersonalRoomServerMessage, { type: 'webrtc-offer' }>
  ): Promise<void> {
    const remoteMachineId = msg.targetMachineId;

    log.info('Received offer from', remoteMachineId);

    let tracked = this.peerConnections.get(remoteMachineId);
    if (!tracked) {
      const pc = this.createPeerConnection(remoteMachineId);
      tracked = {
        pc,
        dataChannel: null,
        remotePeerId: remoteMachineId as PeerID,
        cleanupAdapter: null,
      };
      this.peerConnections.set(remoteMachineId, tracked);
    }

    const pc = tracked.pc;

    try {
      await pc.setRemoteDescription(msg.offer as RTCSessionDescriptionInit);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      const response: PersonalRoomClientMessage = {
        type: 'webrtc-answer',
        targetMachineId: remoteMachineId,
        answer: pc.localDescription,
        requestId: msg.requestId,
      };
      this.sendSignalingMessage(response);
    } catch (error) {
      log.error('Error handling offer:', error);
      this.closePeerConnection(remoteMachineId);
    }
  }

  private async handleWebRtcAnswer(
    msg: Extract<PersonalRoomServerMessage, { type: 'webrtc-answer' }>
  ): Promise<void> {
    const remoteMachineId = msg.targetMachineId;
    const tracked = this.peerConnections.get(remoteMachineId);

    if (!tracked) {
      log.warn('Received answer for unknown peer:', remoteMachineId);
      return;
    }

    log.info('Received answer from', remoteMachineId);

    try {
      await tracked.pc.setRemoteDescription(msg.answer as RTCSessionDescriptionInit);
    } catch (error) {
      log.error('Error handling answer:', error);
      this.closePeerConnection(remoteMachineId);
    }
  }

  private async handleWebRtcIce(
    msg: Extract<PersonalRoomServerMessage, { type: 'webrtc-ice' }>
  ): Promise<void> {
    const remoteMachineId = msg.targetMachineId;
    const tracked = this.peerConnections.get(remoteMachineId);

    if (!tracked) {
      log.warn('Received ICE for unknown peer:', remoteMachineId);
      return;
    }

    try {
      await tracked.pc.addIceCandidate(msg.candidate as RTCIceCandidateInit);
    } catch (error) {
      log.error('Error adding ICE candidate:', error);
    }
  }

  private closePeerConnection(remoteMachineId: string): void {
    const tracked = this.peerConnections.get(remoteMachineId);
    if (!tracked) return;

    log.info('Closing connection to', remoteMachineId);

    if (tracked.cleanupAdapter) {
      tracked.cleanupAdapter();
    }

    if (tracked.dataChannel) {
      tracked.dataChannel.close();
    }

    tracked.pc.close();

    this.peerConnections.delete(remoteMachineId);
  }

  private sendSignalingMessage(msg: PersonalRoomClientMessage): void {
    if (!this.signalingWs || this.signalingWs.readyState !== WebSocket.OPEN) {
      log.warn('Cannot send - not connected to signaling server');
      return;
    }
    this.signalingWs.send(JSON.stringify(msg));
  }

  private scheduleReconnect(): void {
    if (this.isDestroyed || !this.userId || !this.token) return;

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      log.error('Max reconnect attempts reached');
      return;
    }

    const delay = Math.min(this.baseReconnectDelay * 2 ** this.reconnectAttempts, 30000);
    this.reconnectAttempts++;

    log.info(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    this.reconnectTimeout = setTimeout(() => {
      if (this.userId && this.token) {
        this.connect(this.userId, this.token);
      }
    }, delay);
  }

  getConnectedPeers(): string[] {
    return Array.from(this.peerConnections.keys()).filter((id) => {
      const tracked = this.peerConnections.get(id);
      return tracked?.dataChannel?.readyState === 'open';
    });
  }

  isConnectedTo(machineId: string): boolean {
    const tracked = this.peerConnections.get(machineId);
    return tracked?.dataChannel?.readyState === 'open' || false;
  }
}

let webRtcManager: WebRtcSyncManager | null = null;

export function getWebRtcManager(): WebRtcSyncManager {
  if (!webRtcManager) {
    webRtcManager = new WebRtcSyncManager();
  }
  return webRtcManager;
}

export function getWebRtcAdapter(): WebRtcDataChannelAdapter {
  return getWebRtcManager().getAdapter();
}
