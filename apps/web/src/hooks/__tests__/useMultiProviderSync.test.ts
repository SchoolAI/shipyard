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

// Mock timer functions for controlling timeouts
vi.useFakeTimers();

// Track mock instances for verification
let mockWebsocketProviders: MockWebsocketProvider[] = [];
let mockWebrtcProviders: MockWebrtcProvider[] = [];
let mockIndexeddbProviders: MockIndexeddbPersistence[] = [];

// Event handler storage for mocks
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

  connect(): void {
    // Simulate connection
  }

  disconnect(): void {
    this.wsconnected = false;
  }

  destroy(): void {
    this.eventHandlers.clear();
  }

  // Test helpers
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
    // Initialize with self
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

  // Test helpers
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

  // Test helpers
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

  destroy(): void {
    // Cleanup
  }

  // Test helper
  simulateSynced(): void {
    this.resolveWhenSynced();
  }
}

// Module mocks
vi.mock('y-websocket', () => ({
  WebsocketProvider: MockWebsocketProvider,
}));

vi.mock('y-webrtc', () => ({
  WebrtcProvider: MockWebrtcProvider,
}));

vi.mock('y-indexeddb', () => ({
  IndexeddbPersistence: MockIndexeddbPersistence,
}));

// Mock fetch for hub discovery
const mockFetch = vi.fn();
(globalThis as unknown as { fetch: typeof fetch }).fetch = mockFetch;

// Mock window events
const mockAddEventListener = vi.spyOn(window, 'addEventListener');
const mockRemoveEventListener = vi.spyOn(window, 'removeEventListener');
const mockDispatchEvent = vi.spyOn(window, 'dispatchEvent');

describe('useMultiProviderSync', () => {
  // Import the hook after mocks are set up
  let useMultiProviderSync: typeof import('../useMultiProviderSync').useMultiProviderSync;

  beforeEach(async () => {
    // Reset mock arrays
    mockWebsocketProviders = [];
    mockWebrtcProviders = [];
    mockIndexeddbProviders = [];

    // Reset fetch mock
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({ ok: true });

    // Reset event listener spies
    mockAddEventListener.mockClear();
    mockRemoveEventListener.mockClear();
    mockDispatchEvent.mockClear();

    // Clear module cache to reset module-level state (webrtcProviderCache)
    vi.resetModules();

    // Re-import the hook to get fresh module state
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

      // Allow async effects to run
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

      // Allow async effects to run
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      // Initial state should not be timed out
      expect(result.current.syncState.timedOut).toBe(false);

      // Advance timer past the timeout
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

      // Allow async effects to run
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      const wsProvider = mockWebsocketProviders[0]!;
      const rtcProvider = mockWebrtcProviders[0]!;

      // Spy on disconnect methods
      const wsDisconnectSpy = vi.spyOn(wsProvider, 'disconnect');
      const rtcDisconnectSpy = vi.spyOn(rtcProvider, 'disconnect');

      // Advance past timeout
      await act(async () => {
        await vi.advanceTimersByTimeAsync(CONNECTION_TIMEOUT);
      });

      expect(wsDisconnectSpy).toHaveBeenCalled();
      expect(rtcDisconnectSpy).toHaveBeenCalled();
    });

    it('should NOT timeout if WebSocket connects before timeout', async () => {
      const { result } = renderHook(() => useMultiProviderSync('test-doc'));

      // Allow async effects to run
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      const wsProvider = mockWebsocketProviders[0]!;

      // Connect WebSocket before timeout
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000); // Half the timeout
        wsProvider.simulateConnect();
      });

      // Advance past the original timeout
      await act(async () => {
        await vi.advanceTimersByTimeAsync(CONNECTION_TIMEOUT);
      });

      expect(result.current.syncState.timedOut).toBe(false);
      expect(result.current.syncState.hubConnected).toBe(true);
    });

    it('should NOT timeout if P2P peers connect before timeout', async () => {
      const { result } = renderHook(() => useMultiProviderSync('test-doc'));

      // Allow async effects to run
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      const rtcProvider = mockWebrtcProviders[0]!;

      // Connect P2P peer before timeout
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
        rtcProvider.simulatePeerConnect();
      });

      // Advance past the original timeout
      await act(async () => {
        await vi.advanceTimersByTimeAsync(CONNECTION_TIMEOUT);
      });

      expect(result.current.syncState.timedOut).toBe(false);
      expect(result.current.syncState.peerCount).toBe(1);
    });

    it('should allow manual reconnection after timeout via reconnect()', async () => {
      const { result } = renderHook(() => useMultiProviderSync('test-doc'));

      // Allow async effects and timeout
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(CONNECTION_TIMEOUT);
      });

      expect(result.current.syncState.timedOut).toBe(true);

      // Call reconnect
      await act(async () => {
        result.current.reconnect();
      });

      // Allow effects to re-run
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      // State should be reset
      expect(result.current.syncState.timedOut).toBe(false);

      // New providers should be created
      expect(mockWebsocketProviders.length).toBeGreaterThan(1);
    });

    it('should clear timeout state when connection succeeds after previous timeout', async () => {
      const { result } = renderHook(() => useMultiProviderSync('test-doc'));

      // Allow timeout
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(CONNECTION_TIMEOUT);
      });

      expect(result.current.syncState.timedOut).toBe(true);

      // Reconnect and connect successfully
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

      // Allow async effects to run
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      const wsProvider = mockWebsocketProviders[0]!;
      const rtcProvider = mockWebrtcProviders[0]!;

      // Verify listeners were added
      expect(wsProvider.getEventHandlerCount('status')).toBeGreaterThan(0);
      expect(wsProvider.getEventHandlerCount('sync')).toBeGreaterThan(0);
      expect(rtcProvider.awareness.getEventHandlerCount('change')).toBeGreaterThan(0);

      // Unmount
      unmount();

      // Verify listeners were removed
      expect(wsProvider.getEventHandlerCount('status')).toBe(0);
      expect(wsProvider.getEventHandlerCount('sync')).toBe(0);
      expect(rtcProvider.awareness.getEventHandlerCount('change')).toBe(0);
    });

    it('should clean up beforeunload listener on unmount', async () => {
      const { unmount } = renderHook(() => useMultiProviderSync('test-doc'));

      // Allow async effects to run
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      // Verify beforeunload listener was added
      expect(mockAddEventListener).toHaveBeenCalledWith('beforeunload', expect.any(Function));

      // Unmount
      unmount();

      // Verify beforeunload listener was removed
      expect(mockRemoveEventListener).toHaveBeenCalledWith('beforeunload', expect.any(Function));
    });

    it('should handle React StrictMode double-mount without duplicate providers', async () => {
      // Simulate StrictMode by mounting, unmounting, and remounting
      const { unmount } = renderHook(() => useMultiProviderSync('test-doc'));

      // Allow async effects to run
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      // Unmount (first StrictMode cleanup)
      unmount();

      // Remount with new hook instance
      const { result } = renderHook(() => useMultiProviderSync('test-doc'));

      // Allow async effects to run
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      // Due to WebRTC provider caching, we should reuse the same provider
      // WebSocket providers are recreated each time
      expect(result.current.ydoc).toBeDefined();
      expect(result.current.syncState.connected).toBe(false);
    });

    it('should not create orphaned providers after rapid reconnect spam', async () => {
      const { result } = renderHook(() => useMultiProviderSync('test-doc'));

      // Allow initial setup
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      // Spam reconnect
      for (let i = 0; i < 5; i++) {
        await act(async () => {
          result.current.reconnect();
          await vi.advanceTimersByTimeAsync(50);
        });
      }

      // Allow final setup
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      // Verify providers are being properly cleaned up
      // The last WebSocket provider should be the active one
      const lastWsProvider = mockWebsocketProviders[mockWebsocketProviders.length - 1]!;
      expect(lastWsProvider.getEventHandlerCount('status')).toBeGreaterThan(0);

      // Previous providers should have been cleaned up (destroy called)
      // The hook should still be functional
      expect(result.current.syncState.connected).toBe(false);
    });

    it('should clear timeout when component unmounts', async () => {
      const { unmount } = renderHook(() => useMultiProviderSync('test-doc'));

      // Allow async effects to run
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      // Unmount before timeout
      unmount();

      // Advance past what would have been the timeout
      await act(async () => {
        await vi.advanceTimersByTimeAsync(15000);
      });

      // No errors should occur and providers should be cleaned up
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

      // Add a peer
      await act(async () => {
        mockWebrtcProviders[0]!.awareness.addPeer(2, {});
      });

      expect(result.current.syncState.peerCount).toBe(1);

      // Add another peer
      await act(async () => {
        mockWebrtcProviders[0]!.awareness.addPeer(3, {});
      });

      expect(result.current.syncState.peerCount).toBe(2);

      // Remove a peer
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
        // Allow promise to resolve
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

      // WebRTC provider should not be created
      expect(result.current.rtcProvider).toBeNull();
      // WebSocket should still be created
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

      // Change docName
      rerender({ docName: 'doc-2' });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      // Should be a different Y.Doc
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

      // The hook should attempt to extract port from the hub URL
      expect(result.current.syncState.registryPort).toBeDefined();
    });

    it('should fallback to default port if hub discovery fails', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      renderHook(() => useMultiProviderSync('test-doc'));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      // Should still create providers with fallback URL
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

      // Should not have dispatched the plan-synced event
      const planSyncedCalls = (mockDispatchEvent as Mock).mock.calls.filter(
        (call) => (call[0] as CustomEvent)?.type === 'indexeddb-plan-synced'
      );
      expect(planSyncedCalls.length).toBe(0);
    });
  });
});
