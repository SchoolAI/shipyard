import { describe, expect, it } from 'vitest';
import { buildInviteUrl, getTokenTimeRemaining, parseInviteFromUrl } from './invite-token.js';

describe('parseInviteFromUrl', () => {
  it('should parse valid invite URL', () => {
    const url = 'https://example.com/plan/abc123?invite=token123:secretvalue';
    const result = parseInviteFromUrl(url);
    expect(result).toEqual({ tokenId: 'token123', tokenValue: 'secretvalue' });
  });

  it('should return null for URL without invite param', () => {
    const url = 'https://example.com/plan/abc123';
    const result = parseInviteFromUrl(url);
    expect(result).toBeNull();
  });

  it('should return null for malformed invite param', () => {
    const url = 'https://example.com/plan/abc123?invite=onlyonepart';
    const result = parseInviteFromUrl(url);
    expect(result).toBeNull();
  });

  it('should return null for invalid URL', () => {
    const result = parseInviteFromUrl('not a url');
    expect(result).toBeNull();
  });

  it('should handle invite param with colons in token value', () => {
    const url = 'https://example.com/plan/abc123?invite=token123:secret:with:colons';
    const result = parseInviteFromUrl(url);
    expect(result).toEqual({ tokenId: 'token123', tokenValue: 'secret' });
  });
});

describe('buildInviteUrl', () => {
  it('should build correct invite URL', () => {
    const url = buildInviteUrl('https://example.com', 'plan123', 'token456', 'secret789');
    expect(url).toBe('https://example.com/plan/plan123?invite=token456%3Asecret789');
  });

  it('should handle baseUrl with trailing slash', () => {
    const url = buildInviteUrl('https://example.com/', 'plan123', 'token456', 'secret789');
    expect(url).toBe('https://example.com/plan/plan123?invite=token456%3Asecret789');
  });

  it('should round-trip with parseInviteFromUrl', () => {
    const baseUrl = 'https://example.com';
    const planId = 'my-plan-id';
    const tokenId = 'abc12345';
    const tokenValue = 'secretvalue123';

    const url = buildInviteUrl(baseUrl, planId, tokenId, tokenValue);
    const parsed = parseInviteFromUrl(url);

    expect(parsed).toEqual({ tokenId, tokenValue });
  });
});

describe('getTokenTimeRemaining', () => {
  it('should return expired for past timestamp', () => {
    const result = getTokenTimeRemaining(Date.now() - 1000);
    expect(result.expired).toBe(true);
    expect(result.formatted).toBe('Expired');
  });

  it('should format minutes correctly', () => {
    const expiresAt = Date.now() + 25 * 60 * 1000;
    const result = getTokenTimeRemaining(expiresAt);
    expect(result.expired).toBe(false);
    expect(result.minutes).toBeGreaterThanOrEqual(24);
    expect(result.minutes).toBeLessThanOrEqual(26);
    expect(result.formatted).toMatch(/25m/);
  });

  it('should format hours correctly', () => {
    const expiresAt = Date.now() + 90 * 60 * 1000;
    const result = getTokenTimeRemaining(expiresAt);
    expect(result.expired).toBe(false);
    expect(result.formatted).toMatch(/1h 30m/);
  });

  it('should format hours without minutes when exact', () => {
    const expiresAt = Date.now() + 120 * 60 * 1000;
    const result = getTokenTimeRemaining(expiresAt);
    expect(result.formatted).toMatch(/2h/);
    expect(result.formatted).not.toMatch(/0m/);
  });

  it('should handle exactly 60 minutes', () => {
    const expiresAt = Date.now() + 60 * 60 * 1000;
    const result = getTokenTimeRemaining(expiresAt);
    expect(result.expired).toBe(false);
    expect(result.formatted).toBe('1h');
  });

  it('should handle small remaining time', () => {
    const expiresAt = Date.now() + 1 * 60 * 1000;
    const result = getTokenTimeRemaining(expiresAt);
    expect(result.expired).toBe(false);
    expect(result.minutes).toBe(1);
    expect(result.formatted).toBe('1m');
  });

  it('should round up to nearest minute', () => {
    const expiresAt = Date.now() + 30 * 1000;
    const result = getTokenTimeRemaining(expiresAt);
    expect(result.expired).toBe(false);
    expect(result.minutes).toBe(1);
    expect(result.formatted).toBe('1m');
  });
});
