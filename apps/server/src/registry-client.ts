import { registryConfig } from './config/env/registry.js';
import { logger } from './logger.js';

/**
 * Get registry port from config
 */
function getRegistryPorts(): number[] {
  return registryConfig.REGISTRY_PORT;
}

/**
 * Find the active registry server port
 */
async function findRegistryPort(): Promise<number | null> {
  const ports = getRegistryPorts();

  for (const port of ports) {
    try {
      const res = await fetch(`http://localhost:${port}/registry`, {
        signal: AbortSignal.timeout(1000),
      });
      if (res.ok) {
        return port;
      }
    } catch {
      // continue to next port
    }
  }

  return null;
}

/**
 * Register this WebSocket server with the registry
 */
export async function registerWithRegistry(wsPort: number): Promise<boolean> {
  const registryPort = await findRegistryPort();

  if (!registryPort) {
    logger.warn('Registry server not found, skipping registration');
    return false;
  }

  try {
    const res = await fetch(`http://localhost:${registryPort}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ port: wsPort, pid: process.pid }),
      signal: AbortSignal.timeout(2000),
    });

    if (!res.ok) {
      logger.error({ status: res.status }, 'Failed to register with registry');
      return false;
    }

    logger.info({ registryPort, wsPort }, 'Registered with registry server');
    return true;
  } catch (err) {
    logger.error({ err }, 'Error registering with registry');
    return false;
  }
}

/**
 * Unregister this server from the registry.
 * Uses a short timeout since this is called during shutdown.
 */
export async function unregisterFromRegistry(): Promise<void> {
  // Use cached registry port if available, with very short timeout for shutdown
  const ports = getRegistryPorts();

  for (const port of ports) {
    try {
      const res = await fetch(`http://localhost:${port}/unregister`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pid: process.pid }),
        signal: AbortSignal.timeout(500), // Short timeout for shutdown
      });

      if (res.ok) {
        logger.info({ port }, 'Unregistered from registry server');
        return;
      }
    } catch {
      // Try next port or silently fail - registry may already be down
    }
  }

  logger.debug('Registry server not reachable during unregister (may already be down)');
}
