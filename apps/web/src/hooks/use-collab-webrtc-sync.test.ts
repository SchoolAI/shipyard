import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCollabWebRTCSync } from './use-collab-webrtc-sync';

describe('useCollabWebRTCSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing when connection is null', () => {
    const { result } = renderHook(() =>
      useCollabWebRTCSync({
        connection: null,
        collabAdapter: null,
        connectionState: 'disconnected',
        currentUserId: null,
        initialParticipants: [],
      })
    );

    expect(result.current.peerStates).toBeInstanceOf(Map);
  });

  it('returns empty peerStates map when no participants and disconnected', () => {
    const { result } = renderHook(() =>
      useCollabWebRTCSync({
        connection: null,
        collabAdapter: null,
        connectionState: 'disconnected',
        currentUserId: 'user-1',
        initialParticipants: [],
      })
    );

    expect(result.current.peerStates.size).toBe(0);
  });

  it('returns empty peerStates when connectionState is not connected', () => {
    const { result } = renderHook(() =>
      useCollabWebRTCSync({
        connection: null,
        collabAdapter: null,
        connectionState: 'disconnected',
        currentUserId: 'user-1',
        initialParticipants: [],
      })
    );

    expect(result.current.peerStates.size).toBe(0);
  });

  it('returns empty peerStates when currentUserId is null', () => {
    const { result } = renderHook(() =>
      useCollabWebRTCSync({
        connection: null,
        collabAdapter: null,
        connectionState: 'connected',
        currentUserId: null,
        initialParticipants: [],
      })
    );

    expect(result.current.peerStates.size).toBe(0);
  });

  it('returns empty peerStates when collabAdapter is null', () => {
    const { result } = renderHook(() =>
      useCollabWebRTCSync({
        connection: null,
        collabAdapter: null,
        connectionState: 'connected',
        currentUserId: 'user-1',
        initialParticipants: [],
      })
    );

    expect(result.current.peerStates.size).toBe(0);
  });
});
