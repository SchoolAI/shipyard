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
let mockPcListeners: Record<string, Array<(event?: unknown) => void>>;
let mockPcConnectionState: string;
let mockCreatedTerminalChannels: Array<{
  label: string;
  listeners: Record<string, Array<() => void>>;
  close: ReturnType<typeof vi.fn>;
  readyState: string;
  binaryType: string;
}>;

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

const mockOffer = { type: 'offer', sdp: 'mock-sdp' };

const mockPeerConnection = {
  createDataChannel: vi.fn((label: string) => {
    if (label === 'loro-sync') return mockDataChannel;
    // Terminal channels created on-demand via createTerminalChannel
    const ch = {
      label,
      listeners: {} as Record<string, Array<() => void>>,
      close: vi.fn(),
      readyState: 'connecting',
      binaryType: 'blob',
      addEventListener: vi.fn((event: string, handler: () => void) => {
        if (!ch.listeners[event]) ch.listeners[event] = [];
        ch.listeners[event].push(handler);
      }),
      removeEventListener: vi.fn(),
    };
    mockCreatedTerminalChannels.push(ch);
    return ch;
  }),
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
    mockPcListeners = {};
    mockPcConnectionState = 'new';
    mockCreatedTerminalChannels = [];
  });

  it('returns idle when no connection is provided', () => {
    const { result } = renderHook(() =>
      useWebRTCSync({
        connection: null,
        webrtcAdapter: null,
        targetMachineId: null,
        connectionState: 'disconnected',
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
        connectionState: 'connected',
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
        connectionState: 'connected',
      })
    );

    expect(result.current.peerState).toBe('connecting');
    expect(mockPeerConnection.createDataChannel).toHaveBeenCalledWith('loro-sync', {
      ordered: true,
    });
    // Terminal channels are no longer created eagerly -- only on-demand via createTerminalChannel
    expect(mockPeerConnection.createDataChannel).toHaveBeenCalledTimes(1);

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
        connectionState: 'connected',
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
        connectionState: 'connected',
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
        connectionState: 'connected',
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

  it('exposes a stable createTerminalChannel function', () => {
    const { result } = renderHook(() =>
      useWebRTCSync({
        connection: null,
        webrtcAdapter: null,
        targetMachineId: null,
        connectionState: 'disconnected',
      })
    );

    expect(typeof result.current.createTerminalChannel).toBe('function');
  });

  it('createTerminalChannel returns null when no peer connection exists', () => {
    const { result } = renderHook(() =>
      useWebRTCSync({
        connection: null,
        webrtcAdapter: null,
        targetMachineId: null,
        connectionState: 'disconnected',
      })
    );

    expect(result.current.createTerminalChannel('task-1')).toBeNull();
  });

  it('createTerminalChannel creates a data channel with task-scoped label', async () => {
    const mockConn = createMockConnection();
    const mockAdapter = createMockAdapter();
    mockPcConnectionState = 'connected';

    const { result } = renderHook(() =>
      useWebRTCSync({
        connection: mockConn as never,
        webrtcAdapter: mockAdapter as never,
        targetMachineId: 'machine-1',
        connectionState: 'connected',
      })
    );

    await vi.waitFor(() => {
      expect(mockConn.send).toHaveBeenCalled();
    });

    let ch: RTCDataChannel | null = null;
    act(() => {
      ch = result.current.createTerminalChannel('task-123');
    });

    expect(ch).not.toBeNull();
    expect(mockPeerConnection.createDataChannel).toHaveBeenCalledWith('terminal-io:task-123', {
      ordered: true,
    });
    expect(mockCreatedTerminalChannels).toHaveLength(1);
    expect(mockCreatedTerminalChannels[0]?.binaryType).toBe('arraybuffer');
  });

  describe('reconnection', () => {
    it('stays in failed state when peer connection fails (bug demonstration)', async () => {
      vi.useFakeTimers();
      const mockConn = createMockConnection();
      const mockAdapter = createMockAdapter();

      const { result } = renderHook(() =>
        useWebRTCSync({
          connection: mockConn as never,
          webrtcAdapter: mockAdapter as never,
          targetMachineId: 'machine-1',
          connectionState: 'connected',
        })
      );

      await vi.waitFor(() => {
        expect(mockConn.send).toHaveBeenCalledWith(
          expect.objectContaining({ type: 'webrtc-offer' })
        );
      });

      // Simulate peer connection failure
      mockPcConnectionState = 'failed';
      act(() => {
        const handlers = mockPcListeners.connectionstatechange;
        if (handlers) {
          for (const handler of handlers) handler();
        }
      });

      expect(result.current.peerState).toBe('failed');

      // Wait 5 seconds — no recovery should happen (this is the bug)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });

      // BUG: peerState is still 'failed' — no auto-reconnect logic exists
      expect(result.current.peerState).toBe('failed');

      vi.useRealTimers();
    });

    it('re-negotiates when signaling reconnects (connectionState cycles)', async () => {
      const mockConn = createMockConnection();
      const mockAdapter = createMockAdapter();

      const { result, rerender } = renderHook(
        (props: {
          connection: typeof mockConn | null;
          webrtcAdapter: typeof mockAdapter | null;
          targetMachineId: string | null;
          connectionState: string;
        }) =>
          useWebRTCSync({
            connection: props.connection as never,
            webrtcAdapter: props.webrtcAdapter as never,
            targetMachineId: props.targetMachineId,
            connectionState: props.connectionState as never,
          }),
        {
          initialProps: {
            connection: mockConn,
            webrtcAdapter: mockAdapter,
            targetMachineId: 'machine-1',
            connectionState: 'connected',
          },
        }
      );

      // Wait for initial offer
      await vi.waitFor(() => {
        expect(mockConn.send).toHaveBeenCalledWith(
          expect.objectContaining({ type: 'webrtc-offer' })
        );
      });

      expect(result.current.peerState).toBe('connecting');
      vi.clearAllMocks();
      mockDataChannelListeners = {};
      mockPcListeners = {};

      // Simulate signaling disconnect
      rerender({
        connection: mockConn,
        webrtcAdapter: mockAdapter,
        targetMachineId: 'machine-1',
        connectionState: 'reconnecting',
      });

      // Should go idle while disconnected
      expect(result.current.peerState).toBe('idle');
      // Old peer connection should be cleaned up
      expect(mockPeerConnection.close).toHaveBeenCalled();
      vi.clearAllMocks();

      // Simulate signaling reconnect — connectionState returns to 'connected'
      rerender({
        connection: mockConn,
        webrtcAdapter: mockAdapter,
        targetMachineId: 'machine-1',
        connectionState: 'connected',
      });

      // Should re-negotiate: create a new offer
      await vi.waitFor(() => {
        expect(mockPeerConnection.createOffer).toHaveBeenCalled();
        expect(mockConn.send).toHaveBeenCalledWith(
          expect.objectContaining({ type: 'webrtc-offer' })
        );
      });

      expect(result.current.peerState).toBe('connecting');
    });
  });

  it('cleans up on unmount', async () => {
    const mockConn = createMockConnection();
    const mockAdapter = createMockAdapter();

    const { result, unmount } = renderHook(() =>
      useWebRTCSync({
        connection: mockConn as never,
        webrtcAdapter: mockAdapter as never,
        targetMachineId: 'machine-1',
        connectionState: 'connected',
      })
    );

    await vi.waitFor(() => {
      expect(mockConn.send).toHaveBeenCalled();
    });

    // Create a terminal channel before unmounting to verify cleanup
    mockPcConnectionState = 'connected';
    act(() => {
      result.current.createTerminalChannel('task-cleanup');
    });

    unmount();

    expect(mockDataChannel.close).toHaveBeenCalled();
    // Terminal channels created via createTerminalChannel should be closed on cleanup
    for (const ch of mockCreatedTerminalChannels) {
      expect(ch.close).toHaveBeenCalled();
    }
    expect(mockPeerConnection.close).toHaveBeenCalled();
    expect(mockAdapter.detachDataChannel).toHaveBeenCalledWith('machine-1');
  });
});
