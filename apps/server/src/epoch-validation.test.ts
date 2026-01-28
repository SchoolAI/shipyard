import {
  DEFAULT_EPOCH,
  getEpochFromMetadata,
  initPlanMetadata,
  isEpochValid,
} from '@shipyard/schema';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

describe('epoch validation', () => {
  describe('isEpochValid', () => {
    it('should return true when epoch equals minimum', () => {
      expect(isEpochValid(1, 1)).toBe(true);
    });

    it('should return true when epoch exceeds minimum', () => {
      expect(isEpochValid(5, 1)).toBe(true);
    });

    it('should return false when epoch is below minimum', () => {
      expect(isEpochValid(1, 2)).toBe(false);
    });
  });

  describe('getEpochFromMetadata', () => {
    it('should return epoch when present', () => {
      expect(getEpochFromMetadata({ epoch: 5 })).toBe(5);
    });

    it('should return DEFAULT_EPOCH when epoch is undefined', () => {
      expect(getEpochFromMetadata({})).toBe(DEFAULT_EPOCH);
    });
  });

  describe('initPlanMetadata with epoch', () => {
    it('should set epoch when provided', () => {
      const ydoc = new Y.Doc();
      initPlanMetadata(ydoc, { id: 'test', title: 'Test', epoch: 5 });
      const metadata = ydoc.getMap('metadata');
      expect(metadata.get('epoch')).toBe(5);
    });

    it('should default to DEFAULT_EPOCH when not provided', () => {
      const ydoc = new Y.Doc();
      initPlanMetadata(ydoc, { id: 'test', title: 'Test' });
      const metadata = ydoc.getMap('metadata');
      expect(metadata.get('epoch')).toBe(DEFAULT_EPOCH);
    });
  });
});

describe('registryConfig MINIMUM_EPOCH', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.resetModules();
  });

  it('should default to DEFAULT_EPOCH when env var not set', async () => {
    delete process.env.MINIMUM_EPOCH;
    const { registryConfig } = await import('./config/env/registry.js');
    expect(registryConfig.MINIMUM_EPOCH).toBe(DEFAULT_EPOCH);
  });

  it('should parse valid integer from env var', async () => {
    process.env.MINIMUM_EPOCH = '5';
    const { registryConfig } = await import('./config/env/registry.js');
    expect(registryConfig.MINIMUM_EPOCH).toBe(5);
  });

  it('should throw on invalid number', async () => {
    process.env.MINIMUM_EPOCH = 'not-a-number';
    await expect(async () => {
      await import('./config/env/registry.js');
    }).rejects.toThrow('MINIMUM_EPOCH must be a positive integer');
  });

  it('should throw on zero', async () => {
    process.env.MINIMUM_EPOCH = '0';
    await expect(async () => {
      await import('./config/env/registry.js');
    }).rejects.toThrow('MINIMUM_EPOCH must be a positive integer');
  });

  it('should throw on negative number', async () => {
    process.env.MINIMUM_EPOCH = '-1';
    await expect(async () => {
      await import('./config/env/registry.js');
    }).rejects.toThrow('MINIMUM_EPOCH must be a positive integer');
  });
});
