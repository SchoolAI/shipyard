import { afterEach, describe, expect, it, vi } from 'vitest';
import { EnvSchema, getShipyardHome } from './env';

describe('EnvSchema', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('accepts valid env with all fields', () => {
    const result = EnvSchema.safeParse({
      ANTHROPIC_API_KEY: 'sk-ant-test',
      SHIPYARD_DATA_DIR: '/data',
      LOG_LEVEL: 'debug',
      SHIPYARD_SIGNALING_URL: 'https://example.com',
      SHIPYARD_USER_TOKEN: 'token-123',
      SHIPYARD_MACHINE_ID: 'machine-1',
      SHIPYARD_MACHINE_NAME: 'dev-laptop',
    });
    expect(result.success).toBe(true);
  });

  it('applies prod defaults for optional fields', () => {
    vi.stubEnv('SHIPYARD_DEV', '');
    const result = EnvSchema.parse({});
    expect(result.SHIPYARD_DATA_DIR).toBe('~/.shipyard/data');
    expect(result.LOG_LEVEL).toBe('info');
    expect(result.SHIPYARD_DEV).toBe(false);
  });

  it('applies dev data dir default when SHIPYARD_DEV=1', () => {
    vi.stubEnv('SHIPYARD_DEV', '1');
    const result = EnvSchema.parse({ SHIPYARD_DEV: '1' });
    expect(result.SHIPYARD_DEV).toBe(true);
    expect(result.SHIPYARD_DATA_DIR).toBe('~/.shipyard-dev/data');
  });

  it('allows ANTHROPIC_API_KEY to be omitted', () => {
    const result = EnvSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.ANTHROPIC_API_KEY).toBeUndefined();
    }
  });

  it('rejects invalid LOG_LEVEL', () => {
    const result = EnvSchema.safeParse({ LOG_LEVEL: 'verbose' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid SHIPYARD_SIGNALING_URL', () => {
    const result = EnvSchema.safeParse({ SHIPYARD_SIGNALING_URL: 'not-a-url' });
    expect(result.success).toBe(false);
  });
});

describe('getShipyardHome', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns .shipyard dir by default', () => {
    vi.stubEnv('SHIPYARD_DEV', '');
    expect(getShipyardHome()).toMatch(/\.shipyard$/);
    expect(getShipyardHome()).not.toContain('.shipyard-dev');
  });

  it('returns .shipyard-dev dir when SHIPYARD_DEV=1', () => {
    vi.stubEnv('SHIPYARD_DEV', '1');
    expect(getShipyardHome()).toMatch(/\.shipyard-dev$/);
  });

  it('returns .shipyard-dev dir when SHIPYARD_DEV=true', () => {
    vi.stubEnv('SHIPYARD_DEV', 'true');
    expect(getShipyardHome()).toMatch(/\.shipyard-dev$/);
  });
});
