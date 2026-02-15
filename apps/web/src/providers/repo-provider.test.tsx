import { act, renderHook } from '@testing-library/react';
import type { createContext, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

/**
 * Values created in vi.hoisted() are available to hoisted vi.mock()
 * factories and to normal test code.
 */
const { SharedRepoContext, mockRepoReset } = vi.hoisted(() => {
  /**
   * vi.hoisted() runs at the top of the module before any imports,
   * so we cannot reference the 'react' import. However vitest
   * evaluates this expression inline and the value is captured in
   * the returned object. We therefore create a minimal stand-in
   * context by calling React.createContext lazily inside the mock
   * factories (which run after imports). The actual context is set
   * by the @loro-extended/react mock below.
   */
  return {
    SharedRepoContext: { current: null as ReturnType<typeof createContext<unknown>> | null },
    mockRepoReset: vi.fn(),
  };
});

vi.mock('@loro-extended/adapter-webrtc', () => {
  class MockWebRtcDataChannelAdapter {
    adapterType = 'webrtc-datachannel';
  }
  return { WebRtcDataChannelAdapter: MockWebRtcDataChannelAdapter };
});

vi.mock('@loro-extended/repo', () => {
  class MockRepo {
    identity: unknown;
    reset = mockRepoReset;
    constructor(params: Record<string, unknown>) {
      this.identity = params?.identity ?? 'test';
    }
  }
  return { Repo: MockRepo };
});

vi.mock('@loro-extended/react', async () => {
  const react = await vi.importActual<typeof import('react')>('react');
  const ctx = react.createContext<unknown>(null);
  SharedRepoContext.current = ctx;
  return {
    RepoContext: ctx,
    useRepo: () => {
      const repo = react.useContext(ctx);
      if (!repo) throw new Error('useRepo must be used within a RepoProvider');
      return repo;
    },
  };
});

import { ShipyardRepoProvider, useRepo, useWebRtcAdapter } from './repo-provider';

function wrapper({ children }: { children: ReactNode }) {
  return <ShipyardRepoProvider>{children}</ShipyardRepoProvider>;
}

describe('ShipyardRepoProvider', () => {
  it('renders children after effect runs', () => {
    const { result } = renderHook(() => 'rendered', { wrapper });
    expect(result.current).toBe('rendered');
  });

  it('provides repo via useRepo', () => {
    const { result } = renderHook(() => useRepo(), { wrapper });
    expect(result.current).toBeDefined();
    expect(result.current).toHaveProperty('identity');
  });

  it('provides webrtc adapter via useWebRtcAdapter', () => {
    const { result } = renderHook(() => useWebRtcAdapter(), { wrapper });
    expect(result.current).toBeDefined();
    expect(result.current).toHaveProperty('adapterType', 'webrtc-datachannel');
  });

  it('returns null for useWebRtcAdapter without provider', () => {
    const { result } = renderHook(() => useWebRtcAdapter());
    expect(result.current).toBeNull();
  });

  it('calls repo.reset() on unmount', () => {
    mockRepoReset.mockClear();
    const { unmount } = renderHook(() => useRepo(), { wrapper });
    act(() => {
      unmount();
    });
    expect(mockRepoReset).toHaveBeenCalled();
  });
});
