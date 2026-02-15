import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useWebRTCSync } from './use-webrtc-sync';

type MessageHandler = (msg: Record<string, unknown>) => void;

function createMockConnection() {
  const handlers: MessageHandler[] = [];
  return {
    send: vi.fn(),
    onMessage: vi.fn((handler: MessageHandler) => {
      handlers.push(handler);
      return () => {
        const idx = handlers.indexOf(handler);
        if (idx >= 0) handlers.splice(idx, 1);
      };
    }),
    _emitMessage(msg: Record<string, unknown>) {
      for (const handler of handlers) {
        handler(msg);
      }
    },
    _handlers: handlers,
  };
}

function createMockAdapter() {
  return {
    attachDataChannel: vi.fn(),
    detachDataChannel: vi.fn(),
  };
}

let mockDataChannelListeners: Record<string, Array<() => void>>;
let mockTerminalChannelListeners: Record<string, Array<() => void>>;
let mockPcListeners: Record<string, Array<(event?: unknown) => void>>;
let mockPcConnectionState: string;

const mockDataChannel = {
  addEventListener: vi.fn((event: string, handler: () => void) => {
    if (!mockDataChannelListeners[event]) {
      mockDataChannelListeners[event] = [];
    }
    mockDataChannelListeners[event].push(handler);
  }),
  removeEventListener: vi.fn(),
  close: vi.fn(),
  readyState: 'connecting',
};

const mockTerminalChannel = {
  addEventListener: vi.fn((event: string, handler: () => void) => {
    if (!mockTerminalChannelListeners[event]) {
      mockTerminalChannelListeners[event] = [];
    }
    mockTerminalChannelListeners[event].push(handler);
  }),
  removeEventListener: vi.fn(),
  close: vi.fn(),
  readyState: 'connecting',
  binaryType: 'blob',
};

const mockOffer = { type: 'offer', sdp: 'mock-sdp' };

const mockPeerConnection = {
  createDataChannel: vi.fn((label: string) =>
    label === 'terminal-io' ? mockTerminalChannel : mockDataChannel
  ),
  createOffer: vi.fn(() => Promise.resolve(mockOffer)),
  setLocalDescription: vi.fn(() => Promise.resolve()),
  setRemoteDescription: vi.fn(() => Promise.resolve()),
  addIceCandidate: vi.fn(() => Promise.resolve()),
  addEventListener: vi.fn((event: string, handler: (event?: unknown) => void) => {
    if (!mockPcListeners[event]) {
      mockPcListeners[event] = [];
    }
    mockPcListeners[event].push(handler);
  }),
  removeEventListener: vi.fn(),
  close: vi.fn(),
  get connectionState() {
    return mockPcConnectionState;
  },
};

class MockRTCPeerConnection {
  createDataChannel = mockPeerConnection.createDataChannel;
  createOffer = mockPeerConnection.createOffer;
  setLocalDescription = mockPeerConnection.setLocalDescription;
  setRemoteDescription = mockPeerConnection.setRemoteDescription;
  addIceCandidate = mockPeerConnection.addIceCandidate;
  addEventListener = mockPeerConnection.addEventListener;
  removeEventListener = mockPeerConnection.removeEventListener;
  close = mockPeerConnection.close;
  get connectionState() {
    return mockPcConnectionState;
  }
}

class MockRTCSessionDescription {
  type: string;
  sdp: string;
  constructor(init: RTCSessionDescriptionInit) {
    this.type = init.type;
    this.sdp = init.sdp ?? '';
  }
}

class MockRTCIceCandidate {
  candidate: string;
  constructor(init: RTCIceCandidateInit) {
    this.candidate = init.candidate ?? '';
  }
}

vi.stubGlobal('RTCPeerConnection', MockRTCPeerConnection);
vi.stubGlobal('RTCSessionDescription', MockRTCSessionDescription);
vi.stubGlobal('RTCIceCandidate', MockRTCIceCandidate);

describe('useWebRTCSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDataChannelListeners = {};
    mockTerminalChannelListeners = {};
    mockPcListeners = {};
    mockPcConnectionState = 'new';
    mockTerminalChannel.binaryType = 'blob';
  });

  it('returns idle when no connection is provided', () => {
    const { result } = renderHook(() =>
      useWebRTCSync({
        connection: null,
        webrtcAdapter: null,
        targetMachineId: null,
      })
    );

    expect(result.current.peerState).toBe('idle');
  });

  it('returns idle when no targetMachineId is provided', () => {
    const mockConn = createMockConnection();
    const mockAdapter = createMockAdapter();

    const { result } = renderHook(() =>
      useWebRTCSync({
        connection: mockConn as never,
        webrtcAdapter: mockAdapter as never,
        targetMachineId: null,
      })
    );

    expect(result.current.peerState).toBe('idle');
  });

  it('creates a peer connection and sends an offer when all params are provided', async () => {
    const mockConn = createMockConnection();
    const mockAdapter = createMockAdapter();

    const { result } = renderHook(() =>
      useWebRTCSync({
        connection: mockConn as never,
        webrtcAdapter: mockAdapter as never,
        targetMachineId: 'machine-1',
      })
    );

    expect(result.current.peerState).toBe('connecting');
    expect(mockPeerConnection.createDataChannel).toHaveBeenCalledWith('loro-sync', {
      ordered: true,
    });
    expect(mockPeerConnection.createDataChannel).toHaveBeenCalledWith('terminal-io', {
      ordered: true,
    });
    expect(mockTerminalChannel.binaryType).toBe('arraybuffer');

    await vi.waitFor(() => {
      expect(mockConn.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'webrtc-offer',
          targetMachineId: 'machine-1',
        })
      );
    });
  });

  it('transitions to connected when data channel opens', async () => {
    const mockConn = createMockConnection();
    const mockAdapter = createMockAdapter();

    const { result } = renderHook(() =>
      useWebRTCSync({
        connection: mockConn as never,
        webrtcAdapter: mockAdapter as never,
        targetMachineId: 'machine-1',
      })
    );

    await vi.waitFor(() => {
      expect(mockConn.send).toHaveBeenCalled();
    });

    act(() => {
      const openHandlers = mockDataChannelListeners.open;
      if (openHandlers) {
        for (const handler of openHandlers) handler();
      }
    });

    expect(result.current.peerState).toBe('connected');
    expect(mockAdapter.attachDataChannel).toHaveBeenCalledWith('machine-1', mockDataChannel);
  });

  it('handles webrtc-answer messages', async () => {
    const mockConn = createMockConnection();
    const mockAdapter = createMockAdapter();

    renderHook(() =>
      useWebRTCSync({
        connection: mockConn as never,
        webrtcAdapter: mockAdapter as never,
        targetMachineId: 'machine-1',
      })
    );

    await vi.waitFor(() => {
      expect(mockConn.send).toHaveBeenCalled();
    });

    act(() => {
      mockConn._emitMessage({
        type: 'webrtc-answer',
        targetMachineId: 'browser-connection-id',
        fromMachineId: 'machine-1',
        answer: { type: 'answer', sdp: 'answer-sdp' },
      });
    });

    expect(mockPeerConnection.setRemoteDescription).toHaveBeenCalled();
  });

  it('handles webrtc-ice messages', async () => {
    const mockConn = createMockConnection();
    const mockAdapter = createMockAdapter();

    renderHook(() =>
      useWebRTCSync({
        connection: mockConn as never,
        webrtcAdapter: mockAdapter as never,
        targetMachineId: 'machine-1',
      })
    );

    await vi.waitFor(() => {
      expect(mockConn.send).toHaveBeenCalled();
    });

    act(() => {
      mockConn._emitMessage({
        type: 'webrtc-ice',
        targetMachineId: 'browser-connection-id',
        fromMachineId: 'machine-1',
        candidate: { candidate: 'ice-candidate', sdpMid: '0' },
      });
    });

    expect(mockPeerConnection.addIceCandidate).toHaveBeenCalled();
  });

  it('returns terminalChannel as null initially', () => {
    const { result } = renderHook(() =>
      useWebRTCSync({
        connection: null,
        webrtcAdapter: null,
        targetMachineId: null,
      })
    );

    expect(result.current.terminalChannel).toBeNull();
  });

  it('sets terminalChannel when terminal data channel opens', async () => {
    const mockConn = createMockConnection();
    const mockAdapter = createMockAdapter();

    const { result } = renderHook(() =>
      useWebRTCSync({
        connection: mockConn as never,
        webrtcAdapter: mockAdapter as never,
        targetMachineId: 'machine-1',
      })
    );

    await vi.waitFor(() => {
      expect(mockConn.send).toHaveBeenCalled();
    });

    expect(result.current.terminalChannel).toBeNull();

    act(() => {
      const openHandlers = mockTerminalChannelListeners.open;
      if (openHandlers) {
        for (const handler of openHandlers) handler();
      }
    });

    expect(result.current.terminalChannel).toBe(mockTerminalChannel);
  });

  it('clears terminalChannel when terminal data channel closes', async () => {
    const mockConn = createMockConnection();
    const mockAdapter = createMockAdapter();

    const { result } = renderHook(() =>
      useWebRTCSync({
        connection: mockConn as never,
        webrtcAdapter: mockAdapter as never,
        targetMachineId: 'machine-1',
      })
    );

    await vi.waitFor(() => {
      expect(mockConn.send).toHaveBeenCalled();
    });

    act(() => {
      const openHandlers = mockTerminalChannelListeners.open;
      if (openHandlers) {
        for (const handler of openHandlers) handler();
      }
    });

    expect(result.current.terminalChannel).toBe(mockTerminalChannel);

    act(() => {
      const closeHandlers = mockTerminalChannelListeners.close;
      if (closeHandlers) {
        for (const handler of closeHandlers) handler();
      }
    });

    expect(result.current.terminalChannel).toBeNull();
  });

  it('cleans up on unmount', async () => {
    const mockConn = createMockConnection();
    const mockAdapter = createMockAdapter();

    const { unmount } = renderHook(() =>
      useWebRTCSync({
        connection: mockConn as never,
        webrtcAdapter: mockAdapter as never,
        targetMachineId: 'machine-1',
      })
    );

    await vi.waitFor(() => {
      expect(mockConn.send).toHaveBeenCalled();
    });

    unmount();

    expect(mockDataChannel.close).toHaveBeenCalled();
    expect(mockTerminalChannel.close).toHaveBeenCalled();
    expect(mockPeerConnection.close).toHaveBeenCalled();
    expect(mockAdapter.detachDataChannel).toHaveBeenCalledWith('machine-1');
  });
});
