/**
 * Auto-configures Claude Code settings for Shipyard plugin.
 * Ensures marketplace is available and resolves MCP conflicts.
 */

import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { logger } from './logger.js';

const SHIPYARD_MARKETPLACE_NAME = 'schoolai-shipyard';
const SHIPYARD_MARKETPLACE_URL = 'https://github.com/SchoolAI/shipyard.git';

interface ClaudeSettings {
  extraKnownMarketplaces?: Record<string, { source: { source: string; repo: string } }>;
  enabledPlugins?: Record<string, boolean>;
  mcpServers?: Record<string, unknown>;
}

const SETTINGS_PATH = join(homedir(), '.claude', 'settings.json');
const LOCK_PATH = `${SETTINGS_PATH}.lock`;
const LOCK_STALE_MS = 10000;

/**
 * Acquires a file lock for the settings file.
 * Uses a lockfile with stale detection to prevent deadlocks.
 * Returns a release function that must be called when done.
 */
function acquireSettingsLock(): () => void {
  const maxAttempts = 50;
  const retryDelayMs = 100;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const fd = openSync(LOCK_PATH, 'wx');
      writeFileSync(fd, String(Date.now()), 'utf-8');
      closeSync(fd);

      return () => {
        try {
          unlinkSync(LOCK_PATH);
        } catch {}
      };
    } catch (err) {
      /** Check if existing lock is stale */
      if (existsSync(LOCK_PATH)) {
        try {
          const lockContent = readFileSync(LOCK_PATH, 'utf-8');
          const lockTime = Number(lockContent);
          if (Date.now() - lockTime > LOCK_STALE_MS) {
            try {
              unlinkSync(LOCK_PATH);
            } catch {}
            continue;
          }
        } catch {
          continue;
        }
      }

      const waitUntil = Date.now() + retryDelayMs;
      while (Date.now() < waitUntil) {}
    }
  }

  throw new Error(`Failed to acquire settings lock after ${maxAttempts} attempts`);
}

export function ensureShipyardPlugin(): void {
  const releaseLock = acquireSettingsLock();

  try {
    let settings: ClaudeSettings = {};

    try {
      if (existsSync(SETTINGS_PATH)) {
        settings = JSON.parse(readFileSync(SETTINGS_PATH, 'utf-8'));
      }
    } catch (error) {
      logger.warn({ err: error }, 'Failed to read Claude settings, creating new');
    }

    let modified = false;

    if (!settings.extraKnownMarketplaces) {
      settings.extraKnownMarketplaces = {};
    }

    if (!settings.extraKnownMarketplaces[SHIPYARD_MARKETPLACE_NAME]) {
      settings.extraKnownMarketplaces[SHIPYARD_MARKETPLACE_NAME] = {
        source: {
          source: 'github',
          repo: SHIPYARD_MARKETPLACE_URL,
        },
      };
      modified = true;
      logger.info({ marketplaceUrl: SHIPYARD_MARKETPLACE_URL }, 'Added Shipyard marketplace');
    }

    if (settings.mcpServers) {
      for (const [serverName, _config] of Object.entries(settings.mcpServers)) {
        if (serverName.toLowerCase().includes('shipyard')) {
          logger.warn(
            { serverName },
            'Found standalone Shipyard MCP server in settings. ' +
              'The plugin bundles its own MCP server. Consider removing the standalone ' +
              'configuration to avoid tool namespace conflicts.'
          );
        }
      }
    }

    if (modified) {
      mkdirSync(join(homedir(), '.claude'), { recursive: true });
      writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf-8');
      logger.info('Updated Claude Code settings');
    }
  } finally {
    releaseLock();
  }
}
