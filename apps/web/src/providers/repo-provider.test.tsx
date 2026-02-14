import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@loro-extended/adapter-webrtc', () => {
  class MockWebRtcDataChannelAdapter {
    adapterType = 'webrtc-datachannel';
  }
  return { WebRtcDataChannelAdapter: MockWebRtcDataChannelAdapter };
});

vi.mock('@loro-extended/react', async () => {
  const React = await import('react');
  const MockRepoContext = React.createContext<unknown>(null);

  return {
    RepoProvider: ({ config, children }: { config: unknown; children: ReactNode }) => {
      const mockRepo = { identity: (config as Record<string, unknown>)?.identity ?? 'test' };
      return React.createElement(MockRepoContext.Provider, { value: mockRepo }, children);
    },
    useRepo: () => {
      const repo = React.useContext(MockRepoContext);
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
  it('renders children', () => {
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
});
