/**
 * Tests for useMultiProviderSync hook
 *
 * This hook provides critical P2P sync functionality and includes a circuit breaker
 * to prevent infinite reconnection loops (DOS vulnerability fix). These tests verify:
 * 1. Circuit breaker behavior - providers stop after timeout
 * 2. Cleanup behavior - no memory leaks or orphaned providers
 * 3. State transitions - proper sync state management
 *
 * Coverage Target: 60% branch (Tier 1: Shared infrastructure per engineering standards)
 */

// biome-ignore-all lint/style/noNonNullAssertion: Test file - we control mock setup and know values exist

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import type * as Y from 'yjs';

vi.useFakeTimers();

let mockWebsocketProviders: MockWebsocketProvider[] = [];
let mockWebrtcProviders: MockWebrtcProvider[] = [];
let mockIndexeddbProviders: MockIndexeddbPersistence[] = [];

type EventHandler = (...args: unknown[]) => void;

/**
 * Mock WebSocket Provider
 * Simulates y-websocket behavior for testing
 */
class MockWebsocketProvider {
  wsconnected = false;
  synced = false;
  private eventHandlers: Map<string, EventHandler[]> = new Map();

  constructor(
    public serverUrl: string,
    public roomname: string,
    public doc: Y.Doc,
    public options?: { connect?: boolean; maxBackoffTime?: number }
  ) {
    mockWebsocketProviders.push(this);
  }

  on(event: string, handler: EventHandler): void {
    const handlers = this.eventHandlers.get(event) || [];
    handlers.push(handler);
    this.eventHandlers.set(event, handlers);
  }

  off(event: string, handler: EventHandler): void {
    const handlers = this.eventHandlers.get(event) || [];
    const index = handlers.indexOf(handler);
    if (index !== -1) {
      handlers.splice(index, 1);
    }
    this.eventHandlers.set(event, handlers);
  }

  emit(event: string, ...args: unknown[]): void {
    const handlers = this.eventHandlers.get(event) || [];
    for (const handler of handlers) {
      handler(...args);
    }
  }

  connect(): void {}

  disconnect(): void {
    this.wsconnected = false;
  }

  destroy(): void {
    this.eventHandlers.clear();
  }

  simulateConnect(): void {
    this.wsconnected = true;
    this.emit('status', { status: 'connected' });
  }

  simulateSync(): void {
    this.synced = true;
    this.emit('sync', true);
  }

  simulateDisconnect(): void {
    this.wsconnected = false;
    this.emit('status', { status: 'disconnected' });
  }

  getEventHandlerCount(event: string): number {
    return (this.eventHandlers.get(event) || []).length;
  }
}

/**
 * Mock Awareness for WebRTC
 */
class MockAwareness {
  private states = new Map<number, unknown>();
  private eventHandlers: Map<string, EventHandler[]> = new Map();
  private localClientId = 1;

  constructor() {
    this.states.set(this.localClientId, {});
  }

  setLocalStateField(field: string, value: unknown): void {
    const current = (this.states.get(this.localClientId) || {}) as Record<string, unknown>;
    current[field] = value;
    this.states.set(this.localClientId, current);
  }

  setLocalState(state: unknown): void {
    if (state === null) {
      this.states.delete(this.localClientId);
    } else {
      this.states.set(this.localClientId, state);
    }
  }

  getStates(): Map<number, unknown> {
    return this.states;
  }

  on(event: string, handler: EventHandler): void {
    const handlers = this.eventHandlers.get(event) || [];
    handlers.push(handler);
    this.eventHandlers.set(event, handlers);
  }

  off(event: string, handler: EventHandler): void {
    const handlers = this.eventHandlers.get(event) || [];
    const index = handlers.indexOf(handler);
    if (index !== -1) {
      handlers.splice(index, 1);
    }
    this.eventHandlers.set(event, handlers);
  }

  emit(event: string, ...args: unknown[]): void {
    const handlers = this.eventHandlers.get(event) || [];
    for (const handler of handlers) {
      handler(...args);
    }
  }

  addPeer(clientId: number, state: unknown): void {
    this.states.set(clientId, state);
    this.emit('change', { added: [clientId], updated: [], removed: [] });
  }

  removePeer(clientId: number): void {
    this.states.delete(clientId);
    this.emit('change', { added: [], updated: [], removed: [clientId] });
  }

  getEventHandlerCount(event: string): number {
    return (this.eventHandlers.get(event) || []).length;
  }
}

/**
 * Mock WebRTC Provider
 * Simulates y-webrtc behavior for testing
 */
class MockWebrtcProvider {
  connected = false;
  awareness = new MockAwareness();
  private eventHandlers: Map<string, EventHandler[]> = new Map();

  constructor(
    public roomName: string,
    public doc: Y.Doc,
    public options?: { signaling?: string[]; peerOpts?: unknown }
  ) {
    mockWebrtcProviders.push(this);
  }

  on(event: string, handler: EventHandler): void {
    const handlers = this.eventHandlers.get(event) || [];
    handlers.push(handler);
    this.eventHandlers.set(event, handlers);
  }

  off(event: string, handler: EventHandler): void {
    const handlers = this.eventHandlers.get(event) || [];
    const index = handlers.indexOf(handler);
    if (index !== -1) {
      handlers.splice(index, 1);
    }
    this.eventHandlers.set(event, handlers);
  }

  emit(event: string, ...args: unknown[]): void {
    const handlers = this.eventHandlers.get(event) || [];
    for (const handler of handlers) {
      handler(...args);
    }
  }

  connect(): void {
    this.connected = true;
  }

  disconnect(): void {
    this.connected = false;
  }

  destroy(): void {
    this.eventHandlers.clear();
  }

  simulatePeerConnect(): void {
    this.connected = true;
    this.awareness.addPeer(2, { planStatus: { user: { name: 'Peer' } } });
  }

  simulatePeerDisconnect(): void {
    this.awareness.removePeer(2);
  }

  simulateSynced(): void {
    this.emit('synced', { synced: true });
  }

  getEventHandlerCount(event: string): number {
    return (this.eventHandlers.get(event) || []).length;
  }
}

/**
 * Mock IndexedDB Persistence
 * Simulates y-indexeddb behavior for testing
 */
class MockIndexeddbPersistence {
  whenSynced: Promise<void>;
  private resolveWhenSynced!: () => void;

  constructor(
    public docName: string,
    public doc: Y.Doc
  ) {
    mockIndexeddbProviders.push(this);
    this.whenSynced = new Promise((resolve) => {
      this.resolveWhenSynced = resolve;
    });
  }

  destroy(): void {}

  simulateSynced(): void {
    this.resolveWhenSynced();
  }
}

vi.mock('y-websocket', () => ({
  WebsocketProvider: MockWebsocketProvider,
}));

vi.mock('y-webrtc', () => ({
  WebrtcProvider: MockWebrtcProvider,
}));

vi.mock('y-indexeddb', () => ({
  IndexeddbPersistence: MockIndexeddbPersistence,
}));

const mockFetch = vi.fn();
(globalThis as unknown as { fetch: typeof fetch }).fetch = mockFetch;

const mockAddEventListener = vi.spyOn(window, 'addEventListener');
const mockRemoveEventListener = vi.spyOn(window, 'removeEventListener');
const mockDispatchEvent = vi.spyOn(window, 'dispatchEvent');

describe('useMultiProviderSync', () => {
  let useMultiProviderSync: typeof import('../useMultiProviderSync').useMultiProviderSync;

  beforeEach(async () => {
    mockWebsocketProviders = [];
    mockWebrtcProviders = [];
    mockIndexeddbProviders = [];

    mockFetch.mockReset();
    mockFetch.mockResolvedValue({ ok: true });

    mockAddEventListener.mockClear();
    mockRemoveEventListener.mockClear();
    mockDispatchEvent.mockClear();

    vi.resetModules();

    const module = await import('../useMultiProviderSync');
    useMultiProviderSync = module.useMultiProviderSync;
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.clearAllMocks();
  });

  describe('Initial State', () => {
    it('should initialize with disconnected state', async () => {
      const { result } = renderHook(() => useMultiProviderSync('test-doc'));

      expect(result.current.syncState.connected).toBe(false);
      expect(result.current.syncState.hubConnected).toBe(false);
      expect(result.current.syncState.synced).toBe(false);
      expect(result.current.syncState.timedOut).toBe(false);
      expect(result.current.syncState.peerCount).toBe(0);
      expect(result.current.syncState.idbSynced).toBe(false);
    });

    it('should create a new Y.Doc for the document', async () => {
      const { result } = renderHook(() => useMultiProviderSync('test-doc'));

      expect(result.current.ydoc).toBeDefined();
      expect(result.current.ydoc.guid).toBeDefined();
    });

    it('should skip provider setup when docName is empty', async () => {
      renderHook(() => useMultiProviderSync(''));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      expect(mockWebsocketProviders.length).toBe(0);
      expect(mockWebrtcProviders.length).toBe(0);
      expect(mockIndexeddbProviders.length).toBe(0);
    });
  });

  describe('Circuit Breaker Behavior', () => {
    const CONNECTION_TIMEOUT = 10000;

    it('should timeout after 10 seconds if no connection is established', async () => {
      const { result } = renderHook(() => useMultiProviderSync('test-doc'));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      expect(result.current.syncState.timedOut).toBe(false);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(CONNECTION_TIMEOUT);
      });

      expect(result.current.syncState.timedOut).toBe(true);
      if (result.current.syncState.timedOut) {
        expect(result.current.syncState.error).toContain('Connection timeout');
      }
    });

    it('should disconnect providers after timeout to prevent infinite reconnection', async () => {
      renderHook(() => useMultiProviderSync('test-doc'));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      const wsProvider = mockWebsocketProviders[0]!;
      const rtcProvider = mockWebrtcProviders[0]!;

      const wsDisconnectSpy = vi.spyOn(wsProvider, 'disconnect');
      const rtcDisconnectSpy = vi.spyOn(rtcProvider, 'disconnect');

      await act(async () => {
        await vi.advanceTimersByTimeAsync(CONNECTION_TIMEOUT);
      });

      expect(wsDisconnectSpy).toHaveBeenCalled();
      expect(rtcDisconnectSpy).toHaveBeenCalled();
    });

    it('should NOT timeout if WebSocket connects before timeout', async () => {
      const { result } = renderHook(() => useMultiProviderSync('test-doc'));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      const wsProvider = mockWebsocketProviders[0]!;

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
        wsProvider.simulateConnect();
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(CONNECTION_TIMEOUT);
      });

      expect(result.current.syncState.timedOut).toBe(false);
      expect(result.current.syncState.hubConnected).toBe(true);
    });

    it('should NOT timeout if P2P peers connect before timeout', async () => {
      const { result } = renderHook(() => useMultiProviderSync('test-doc'));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      const rtcProvider = mockWebrtcProviders[0]!;

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
        rtcProvider.simulatePeerConnect();
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(CONNECTION_TIMEOUT);
      });

      expect(result.current.syncState.timedOut).toBe(false);
      expect(result.current.syncState.peerCount).toBe(1);
    });

    it('should allow manual reconnection after timeout via reconnect()', async () => {
      const { result } = renderHook(() => useMultiProviderSync('test-doc'));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(CONNECTION_TIMEOUT);
      });

      expect(result.current.syncState.timedOut).toBe(true);

      await act(async () => {
        result.current.reconnect();
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      expect(result.current.syncState.timedOut).toBe(false);

      expect(mockWebsocketProviders.length).toBeGreaterThan(1);
    });

    it('should clear timeout state when connection succeeds after previous timeout', async () => {
      const { result } = renderHook(() => useMultiProviderSync('test-doc'));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(CONNECTION_TIMEOUT);
      });

      expect(result.current.syncState.timedOut).toBe(true);

      await act(async () => {
        result.current.reconnect();
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      const newWsProvider = mockWebsocketProviders[mockWebsocketProviders.length - 1]!;

      await act(async () => {
        newWsProvider.simulateConnect();
      });

      expect(result.current.syncState.timedOut).toBe(false);
      expect(result.current.syncState.hubConnected).toBe(true);
    });
  });

  describe('Cleanup Behavior (Memory Leak Prevention)', () => {
    it('should remove all event listeners when unmounting', async () => {
      const { unmount } = renderHook(() => useMultiProviderSync('test-doc'));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      const wsProvider = mockWebsocketProviders[0]!;
      const rtcProvider = mockWebrtcProviders[0]!;

      expect(wsProvider.getEventHandlerCount('status')).toBeGreaterThan(0);
      expect(wsProvider.getEventHandlerCount('sync')).toBeGreaterThan(0);
      expect(rtcProvider.awareness.getEventHandlerCount('change')).toBeGreaterThan(0);

      unmount();

      expect(wsProvider.getEventHandlerCount('status')).toBe(0);
      expect(wsProvider.getEventHandlerCount('sync')).toBe(0);
      expect(rtcProvider.awareness.getEventHandlerCount('change')).toBe(0);
    });

    it('should clean up beforeunload listener on unmount', async () => {
      const { unmount } = renderHook(() => useMultiProviderSync('test-doc'));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      expect(mockAddEventListener).toHaveBeenCalledWith('beforeunload', expect.any(Function));

      unmount();

      expect(mockRemoveEventListener).toHaveBeenCalledWith('beforeunload', expect.any(Function));
    });

    it('should handle React StrictMode double-mount without duplicate providers', async () => {
      const { unmount } = renderHook(() => useMultiProviderSync('test-doc'));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      unmount();

      const { result } = renderHook(() => useMultiProviderSync('test-doc'));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      expect(result.current.ydoc).toBeDefined();
      expect(result.current.syncState.connected).toBe(false);
    });

    it('should not create orphaned providers after rapid reconnect spam', async () => {
      const { result } = renderHook(() => useMultiProviderSync('test-doc'));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      for (let i = 0; i < 5; i++) {
        await act(async () => {
          result.current.reconnect();
          await vi.advanceTimersByTimeAsync(50);
        });
      }

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      const lastWsProvider = mockWebsocketProviders[mockWebsocketProviders.length - 1]!;
      expect(lastWsProvider.getEventHandlerCount('status')).toBeGreaterThan(0);

      expect(result.current.syncState.connected).toBe(false);
    });

    it('should clear timeout when component unmounts', async () => {
      const { unmount } = renderHook(() => useMultiProviderSync('test-doc'));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      unmount();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(15000);
      });

      expect(mockWebsocketProviders[0]!.getEventHandlerCount('status')).toBe(0);
    });
  });

  describe('State Transitions', () => {
    it('should transition timedOut: false -> true after 10s without connection', async () => {
      const { result } = renderHook(() => useMultiProviderSync('test-doc'));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      expect(result.current.syncState.timedOut).toBe(false);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000);
      });

      expect(result.current.syncState.timedOut).toBe(true);
    });

    it('should transition connected: false -> true when WebSocket connects', async () => {
      const { result } = renderHook(() => useMultiProviderSync('test-doc'));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      expect(result.current.syncState.connected).toBe(false);

      await act(async () => {
        mockWebsocketProviders[0]!.simulateConnect();
      });

      expect(result.current.syncState.connected).toBe(true);
      expect(result.current.syncState.hubConnected).toBe(true);
    });

    it('should transition synced: false -> true after initial sync', async () => {
      const { result } = renderHook(() => useMultiProviderSync('test-doc'));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      expect(result.current.syncState.synced).toBe(false);

      await act(async () => {
        mockWebsocketProviders[0]!.simulateConnect();
        mockWebsocketProviders[0]!.simulateSync();
      });

      expect(result.current.syncState.synced).toBe(true);
    });

    it('should update peerCount when P2P peers join/leave', async () => {
      const { result } = renderHook(() => useMultiProviderSync('test-doc'));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      expect(result.current.syncState.peerCount).toBe(0);

      await act(async () => {
        mockWebrtcProviders[0]!.awareness.addPeer(2, {});
      });

      expect(result.current.syncState.peerCount).toBe(1);

      await act(async () => {
        mockWebrtcProviders[0]!.awareness.addPeer(3, {});
      });

      expect(result.current.syncState.peerCount).toBe(2);

      await act(async () => {
        mockWebrtcProviders[0]!.awareness.removePeer(2);
      });

      expect(result.current.syncState.peerCount).toBe(1);
    });

    it('should update idbSynced when IndexedDB syncs', async () => {
      const { result } = renderHook(() => useMultiProviderSync('test-doc'));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      expect(result.current.syncState.idbSynced).toBe(false);

      await act(async () => {
        mockIndexeddbProviders[0]!.simulateSynced();
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(result.current.syncState.idbSynced).toBe(true);
    });

    it('should expose wsProvider and rtcProvider refs', async () => {
      const { result } = renderHook(() => useMultiProviderSync('test-doc'));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      expect(result.current.wsProvider).toBeDefined();
      expect(result.current.rtcProvider).toBeDefined();
    });
  });

  describe('Configuration Options', () => {
    it('should disable WebRTC when enableWebRTC is false', async () => {
      const { result } = renderHook(() =>
        useMultiProviderSync('test-doc', { enableWebRTC: false })
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      expect(result.current.rtcProvider).toBeNull();
      expect(mockWebsocketProviders.length).toBeGreaterThan(0);
    });

    it('should use provided userName for awareness', async () => {
      renderHook(() => useMultiProviderSync('test-doc', { userName: 'TestUser' }));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      const rtcProvider = mockWebrtcProviders[0]!;
      const states = rtcProvider.awareness.getStates();
      const localState = states.get(1) as { planStatus?: { user?: { name?: string } } };

      expect(localState?.planStatus?.user?.name).toBe('TestUser');
    });

    it('should default userName to Anonymous', async () => {
      renderHook(() => useMultiProviderSync('test-doc'));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      const rtcProvider = mockWebrtcProviders[0]!;
      const states = rtcProvider.awareness.getStates();
      const localState = states.get(1) as { planStatus?: { user?: { name?: string } } };

      expect(localState?.planStatus?.user?.name).toBe('Anonymous');
    });
  });

  describe('Document Name Changes', () => {
    it('should create new Y.Doc when docName changes', async () => {
      const { result, rerender } = renderHook(({ docName }) => useMultiProviderSync(docName), {
        initialProps: { docName: 'doc-1' },
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      const firstDocGuid = result.current.ydoc.guid;

      rerender({ docName: 'doc-2' });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      expect(result.current.ydoc.guid).not.toBe(firstDocGuid);
    });
  });

  describe('Hub Discovery', () => {
    it('should extract registry port from discovered hub URL', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      const { result } = renderHook(() => useMultiProviderSync('test-doc'));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      expect(result.current.syncState.registryPort).toBeDefined();
    });

    it('should fallback to default port if hub discovery fails', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      renderHook(() => useMultiProviderSync('test-doc'));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      expect(mockWebsocketProviders.length).toBeGreaterThan(0);
    });
  });

  describe('IndexedDB Plan Sync Events', () => {
    it('should dispatch indexeddb-plan-synced event for plan documents', async () => {
      renderHook(() => useMultiProviderSync('my-plan-id'));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      await act(async () => {
        mockIndexeddbProviders[0]!.simulateSynced();
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(mockDispatchEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'indexeddb-plan-synced',
          detail: { planId: 'my-plan-id' },
        })
      );
    });

    it('should NOT dispatch indexeddb-plan-synced event for plan-index', async () => {
      renderHook(() => useMultiProviderSync('plan-index'));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      mockDispatchEvent.mockClear();

      await act(async () => {
        mockIndexeddbProviders[0]!.simulateSynced();
        await vi.advanceTimersByTimeAsync(0);
      });

      const planSyncedCalls = (mockDispatchEvent as Mock).mock.calls.filter(
        (call) => (call[0] as CustomEvent)?.type === 'indexeddb-plan-synced'
      );
      expect(planSyncedCalls.length).toBe(0);
    });
  });
});
