import { describe, expect, it, vi } from 'vitest';
import {
  createPeerManager,
  type MinimalPeerConnection,
  type PeerManagerConfig,
  type SDPDescription,
} from './peer-manager.js';

function createMockPeerConnection(): MinimalPeerConnection {
  return {
    connectionState: 'new',
    onicecandidate: null,
    ondatachannel: null,
    onconnectionstatechange: null,
    setRemoteDescription: vi.fn(async () => {}),
    createAnswer: vi.fn(async () => ({ type: 'answer' as const, sdp: 'v=0\r\nanswer\r\n' })),
    setLocalDescription: vi.fn(async () => {}),
    addIceCandidate: vi.fn(async () => {}),
    close: vi.fn(),
  };
}

function createMockWebRtcAdapter() {
  return {
    attachDataChannel: vi.fn(),
    detachDataChannel: vi.fn(),
  };
}

function createMockConfig(
  overrides?: Partial<PeerManagerConfig>
): PeerManagerConfig & { mockPc: MinimalPeerConnection } {
  const mockPc = createMockPeerConnection();
  return {
    webrtcAdapter: createMockWebRtcAdapter() as unknown as PeerManagerConfig['webrtcAdapter'],
    onAnswer: vi.fn(),
    onIceCandidate: vi.fn(),
    createPeerConnection: () => mockPc,
    mockPc,
    ...overrides,
  };
}

describe('createPeerManager', () => {
  it('creates a PeerManager with all required methods', () => {
    const config = createMockConfig();
    const pm = createPeerManager(config);

    expect(pm.handleOffer).toBeTypeOf('function');
    expect(pm.handleAnswer).toBeTypeOf('function');
    expect(pm.handleIce).toBeTypeOf('function');
    expect(pm.destroy).toBeTypeOf('function');
  });

  it('destroy() cleans up without error when no peers exist', () => {
    const config = createMockConfig();
    const pm = createPeerManager(config);

    expect(() => pm.destroy()).not.toThrow();
  });

  it('handleAnswer for unknown peer does not throw', async () => {
    const config = createMockConfig();
    const pm = createPeerManager(config);

    await expect(
      pm.handleAnswer('unknown-machine', { type: 'answer', sdp: 'v=0\r\n' })
    ).resolves.toBeUndefined();
  });

  it('handleIce for unknown peer does not throw', async () => {
    const config = createMockConfig();
    const pm = createPeerManager(config);

    await expect(
      pm.handleIce('unknown-machine', { candidate: '', sdpMid: '0', sdpMLineIndex: 0 })
    ).resolves.toBeUndefined();
  });

  it('handleOffer creates peer connection and sends answer', async () => {
    const onAnswer = vi.fn();
    const config = createMockConfig({ onAnswer });
    const pm = createPeerManager(config);

    const offer: SDPDescription = { type: 'offer', sdp: 'v=0\r\noffer\r\n' };
    await pm.handleOffer('browser-1', offer);

    expect(onAnswer).toHaveBeenCalledWith('browser-1', expect.objectContaining({ type: 'answer' }));

    pm.destroy();
  });

  it('handleOffer sets remote description and creates answer', async () => {
    const config = createMockConfig();
    const pm = createPeerManager(config);

    const offer: SDPDescription = { type: 'offer', sdp: 'v=0\r\noffer\r\n' };
    await pm.handleOffer('browser-1', offer);

    expect(config.mockPc.setRemoteDescription).toHaveBeenCalledWith(offer);
    expect(config.mockPc.createAnswer).toHaveBeenCalled();
    expect(config.mockPc.setLocalDescription).toHaveBeenCalled();

    pm.destroy();
  });

  it('handleAnswer sets remote description on existing peer', async () => {
    const config = createMockConfig();
    const pm = createPeerManager(config);

    await pm.handleOffer('browser-1', { type: 'offer', sdp: 'v=0\r\n' });

    const answer: SDPDescription = { type: 'answer', sdp: 'v=0\r\nanswer\r\n' };
    await pm.handleAnswer('browser-1', answer);

    expect(config.mockPc.setRemoteDescription).toHaveBeenCalledTimes(2);
    expect(config.mockPc.setRemoteDescription).toHaveBeenLastCalledWith(answer);

    pm.destroy();
  });

  it('handleIce adds ICE candidate on existing peer', async () => {
    const config = createMockConfig();
    const pm = createPeerManager(config);

    await pm.handleOffer('browser-1', { type: 'offer', sdp: 'v=0\r\n' });

    const candidate = { candidate: 'candidate:1', sdpMid: '0', sdpMLineIndex: 0 };
    await pm.handleIce('browser-1', candidate);

    expect(config.mockPc.addIceCandidate).toHaveBeenCalledWith(candidate);

    pm.destroy();
  });

  it('destroy() detaches data channels and closes peers', async () => {
    const adapter = createMockWebRtcAdapter();
    const mockPc = createMockPeerConnection();
    const config = createMockConfig({
      webrtcAdapter: adapter as unknown as PeerManagerConfig['webrtcAdapter'],
      createPeerConnection: () => mockPc,
    });
    const pm = createPeerManager(config);

    await pm.handleOffer('browser-1', { type: 'offer', sdp: 'v=0\r\n' });

    pm.destroy();

    expect(adapter.detachDataChannel).toHaveBeenCalled();
    expect(mockPc.close).toHaveBeenCalled();
  });

  it('registers onicecandidate handler', async () => {
    const onIceCandidate = vi.fn();
    const config = createMockConfig({ onIceCandidate });
    const pm = createPeerManager(config);

    await pm.handleOffer('browser-1', { type: 'offer', sdp: 'v=0\r\n' });

    expect(config.mockPc.onicecandidate).toBeTypeOf('function');

    config.mockPc.onicecandidate?.({
      candidate: { candidate: 'test-candidate', sdpMid: '0', sdpMLineIndex: 0 },
    });

    expect(onIceCandidate).toHaveBeenCalledWith('browser-1', {
      candidate: 'test-candidate',
      sdpMid: '0',
      sdpMLineIndex: 0,
    });

    pm.destroy();
  });

  it('registers ondatachannel handler that attaches to adapter', async () => {
    const adapter = createMockWebRtcAdapter();
    const mockPc = createMockPeerConnection();
    const config = createMockConfig({
      webrtcAdapter: adapter as unknown as PeerManagerConfig['webrtcAdapter'],
      createPeerConnection: () => mockPc,
    });
    const pm = createPeerManager(config);

    await pm.handleOffer('browser-1', { type: 'offer', sdp: 'v=0\r\n' });

    expect(mockPc.ondatachannel).toBeTypeOf('function');

    const fakeChannel = { label: 'loro-sync' };
    mockPc.ondatachannel?.({ channel: fakeChannel });

    expect(adapter.attachDataChannel).toHaveBeenCalled();

    pm.destroy();
  });
});
