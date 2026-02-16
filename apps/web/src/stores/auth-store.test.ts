import { beforeEach, describe, expect, it } from 'vitest';
import { useAuthStore } from './auth-store';

describe('useAuthStore', () => {
  beforeEach(() => {
    useAuthStore.setState(useAuthStore.getInitialState(), true);
  });

  it('initializes with null token, null user, not exchanging, no error', () => {
    const state = useAuthStore.getState();
    expect(state.token).toBe(null);
    expect(state.user).toBe(null);
    expect(state.isExchanging).toBe(false);
    expect(state.error).toBe(null);
  });

  it('login sets token and user, clears error', () => {
    useAuthStore.getState().setError('old error');
    useAuthStore
      .getState()
      .login('tok_abc', { id: 'gh_12345', displayName: 'Octocat', providers: ['github'] });

    const state = useAuthStore.getState();
    expect(state.token).toBe('tok_abc');
    expect(state.user).toEqual({ id: 'gh_12345', displayName: 'Octocat', providers: ['github'] });
    expect(state.error).toBe(null);
  });

  it('logout clears everything', () => {
    useAuthStore
      .getState()
      .login('tok_abc', { id: 'gh_12345', displayName: 'Octocat', providers: ['github'] });
    useAuthStore.getState().setExchanging(true);
    useAuthStore.getState().logout();

    const state = useAuthStore.getState();
    expect(state.token).toBe(null);
    expect(state.user).toBe(null);
    expect(state.isExchanging).toBe(false);
    expect(state.error).toBe(null);
  });

  it('login then logout round-trip returns to initial state', () => {
    useAuthStore
      .getState()
      .login('tok_abc', { id: 'gh_12345', displayName: 'Octocat', providers: ['github'] });
    useAuthStore.getState().logout();

    const state = useAuthStore.getState();
    const initial = useAuthStore.getInitialState();
    expect(state.token).toBe(initial.token);
    expect(state.user).toBe(initial.user);
    expect(state.isExchanging).toBe(initial.isExchanging);
    expect(state.error).toBe(initial.error);
  });

  it('setError clears isExchanging', () => {
    useAuthStore.getState().setExchanging(true);
    useAuthStore.getState().setError('something went wrong');

    const state = useAuthStore.getState();
    expect(state.error).toBe('something went wrong');
    expect(state.isExchanging).toBe(false);
  });

  it('login clears prior error', () => {
    useAuthStore.getState().setError('prior error');
    useAuthStore
      .getState()
      .login('tok_xyz', { id: 'gh_99', displayName: 'Mona', providers: ['github'] });

    expect(useAuthStore.getState().error).toBe(null);
  });

  it('login does not affect isExchanging if not set', () => {
    expect(useAuthStore.getState().isExchanging).toBe(false);
    useAuthStore
      .getState()
      .login('tok_abc', { id: 'gh_12345', displayName: 'Octocat', providers: ['github'] });
    expect(useAuthStore.getState().isExchanging).toBe(false);
  });
});
