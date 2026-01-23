import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('webConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.resetModules();
  });

  describe('SHIPYARD_WEB_URL', () => {
    it('should default to production URL when env var not set', async () => {
      delete process.env.SHIPYARD_WEB_URL;

      const { webConfig } = await import('./web.js');

      expect(webConfig.SHIPYARD_WEB_URL).toBe('https://schoolai.github.io/shipyard');
    });

    it('should allow overriding with localhost for local development', async () => {
      process.env.SHIPYARD_WEB_URL = 'http://localhost:5173';

      const { webConfig } = await import('./web.js');

      expect(webConfig.SHIPYARD_WEB_URL).toBe('http://localhost:5173');
    });

    it('should use valid URL from env var', async () => {
      process.env.SHIPYARD_WEB_URL = 'https://example.com';

      const { webConfig } = await import('./web.js');

      expect(webConfig.SHIPYARD_WEB_URL).toBe('https://example.com');
    });

    it('should accept URL with port', async () => {
      process.env.SHIPYARD_WEB_URL = 'http://localhost:3000';

      const { webConfig } = await import('./web.js');

      expect(webConfig.SHIPYARD_WEB_URL).toBe('http://localhost:3000');
    });

    it('should accept URL with path', async () => {
      process.env.SHIPYARD_WEB_URL = 'https://example.com/app';

      const { webConfig } = await import('./web.js');

      expect(webConfig.SHIPYARD_WEB_URL).toBe('https://example.com/app');
    });

    it('should accept URL with query params', async () => {
      process.env.SHIPYARD_WEB_URL = 'https://example.com?param=value';

      const { webConfig } = await import('./web.js');

      expect(webConfig.SHIPYARD_WEB_URL).toBe('https://example.com?param=value');
    });

    it('should throw error for invalid URL', async () => {
      process.env.SHIPYARD_WEB_URL = 'not-a-url';

      await expect(async () => {
        await import('./web.js');
      }).rejects.toThrow('Environment variable validation failed');
    });

    it('should throw error for URL without protocol', async () => {
      process.env.SHIPYARD_WEB_URL = 'example.com';

      await expect(async () => {
        await import('./web.js');
      }).rejects.toThrow('Environment variable validation failed');
    });

    it('should throw error for empty string', async () => {
      process.env.SHIPYARD_WEB_URL = '';

      await expect(async () => {
        await import('./web.js');
      }).rejects.toThrow('Environment variable validation failed');
    });

    it('should accept localhost with port (no protocol)', async () => {
      // Zod's .url() validation accepts this as a valid URL
      process.env.SHIPYARD_WEB_URL = 'localhost:5173';

      const { webConfig } = await import('./web.js');

      expect(webConfig.SHIPYARD_WEB_URL).toBe('localhost:5173');
    });

    it('should accept https URLs', async () => {
      process.env.SHIPYARD_WEB_URL = 'https://secure.example.com';

      const { webConfig } = await import('./web.js');

      expect(webConfig.SHIPYARD_WEB_URL).toBe('https://secure.example.com');
    });

    it('should accept ws URLs', async () => {
      process.env.SHIPYARD_WEB_URL = 'ws://example.com';

      const { webConfig } = await import('./web.js');

      expect(webConfig.SHIPYARD_WEB_URL).toBe('ws://example.com');
    });

    it('should accept wss URLs', async () => {
      process.env.SHIPYARD_WEB_URL = 'wss://example.com';

      const { webConfig } = await import('./web.js');

      expect(webConfig.SHIPYARD_WEB_URL).toBe('wss://example.com');
    });
  });
});
