import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildGitHubAuthorizeUrl,
  getOAuthParamsFromUrl,
  isTokenExpired,
  validateOAuthState,
} from './github-oauth';

const mockSessionStorage = (() => {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
  };
})();

Object.defineProperty(globalThis, 'sessionStorage', {
  value: mockSessionStorage,
  writable: true,
});

function makeJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = btoa(JSON.stringify(payload));
  return `${header}.${body}.signature`;
}

describe('buildGitHubAuthorizeUrl', () => {
  beforeEach(() => mockSessionStorage.clear());

  it('returns a valid GitHub authorize URL with correct params', () => {
    const url = buildGitHubAuthorizeUrl('my-client-id', 'https://app.example.com/callback');
    const parsed = new URL(url);

    expect(parsed.origin).toBe('https://github.com');
    expect(parsed.pathname).toBe('/login/oauth/authorize');
    expect(parsed.searchParams.get('client_id')).toBe('my-client-id');
    expect(parsed.searchParams.get('redirect_uri')).toBe('https://app.example.com/callback');
    expect(parsed.searchParams.get('state')).toBeTruthy();
  });

  it('stores the state in sessionStorage', () => {
    const url = buildGitHubAuthorizeUrl('cid', 'https://example.com/cb');
    const state = new URL(url).searchParams.get('state');

    expect(mockSessionStorage.getItem('shipyard-oauth-state')).toBe(state);
  });
});

describe('validateOAuthState', () => {
  beforeEach(() => mockSessionStorage.clear());

  it('returns true when state matches', () => {
    mockSessionStorage.setItem('shipyard-oauth-state', 'abc123');
    expect(validateOAuthState('abc123')).toBe(true);
  });

  it('returns false when state does not match', () => {
    mockSessionStorage.setItem('shipyard-oauth-state', 'abc123');
    expect(validateOAuthState('wrong')).toBe(false);
  });

  it('returns false when no state is stored', () => {
    expect(validateOAuthState('anything')).toBe(false);
  });

  it('clears storage after check', () => {
    mockSessionStorage.setItem('shipyard-oauth-state', 'abc123');
    validateOAuthState('abc123');
    expect(mockSessionStorage.getItem('shipyard-oauth-state')).toBeNull();
  });

  it('clears storage even on mismatch', () => {
    mockSessionStorage.setItem('shipyard-oauth-state', 'abc123');
    validateOAuthState('wrong');
    expect(mockSessionStorage.getItem('shipyard-oauth-state')).toBeNull();
  });
});

describe('isTokenExpired', () => {
  it('returns false for a token with future expiration', () => {
    const futureExp = Math.floor(Date.now() / 1000) + 3600;
    expect(isTokenExpired(makeJwt({ exp: futureExp }))).toBe(false);
  });

  it('returns true for a token with past expiration', () => {
    const pastExp = Math.floor(Date.now() / 1000) - 3600;
    expect(isTokenExpired(makeJwt({ exp: pastExp }))).toBe(true);
  });

  it('returns true for garbage input', () => {
    expect(isTokenExpired('not.a.jwt')).toBe(true);
    expect(isTokenExpired('')).toBe(true);
    expect(isTokenExpired('onlyone')).toBe(true);
  });

  it('returns true when exp field is missing', () => {
    expect(isTokenExpired(makeJwt({ sub: 'user' }))).toBe(true);
  });

  it('returns true when exp is not a number', () => {
    expect(isTokenExpired(makeJwt({ exp: 'not-a-number' }))).toBe(true);
  });
});

describe('getOAuthParamsFromUrl', () => {
  const originalLocation = window.location;

  function setSearch(search: string) {
    Object.defineProperty(window, 'location', {
      value: { ...originalLocation, search },
      writable: true,
      configurable: true,
    });
  }

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
      configurable: true,
    });
  });

  it('returns code and state when both are present', () => {
    setSearch('?code=abc&state=xyz');
    expect(getOAuthParamsFromUrl()).toEqual({ code: 'abc', state: 'xyz' });
  });

  it('returns null when code is missing', () => {
    setSearch('?state=xyz');
    expect(getOAuthParamsFromUrl()).toBeNull();
  });

  it('returns null when state is missing', () => {
    setSearch('?code=abc');
    expect(getOAuthParamsFromUrl()).toBeNull();
  });

  it('returns null when both are missing', () => {
    setSearch('');
    expect(getOAuthParamsFromUrl()).toBeNull();
  });
});
