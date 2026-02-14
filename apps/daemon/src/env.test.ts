import { describe, expect, it } from 'vitest';
import { EnvSchema } from './env';

describe('EnvSchema', () => {
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

  it('applies defaults for optional fields', () => {
    const result = EnvSchema.parse({});
    expect(result.SHIPYARD_DATA_DIR).toBe('~/.shipyard/data');
    expect(result.LOG_LEVEL).toBe('info');
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
