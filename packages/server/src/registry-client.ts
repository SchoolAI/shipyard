import { logger } from './logger.js';

// Default registry ports to try
const DEFAULT_REGISTRY_PORTS = [32191, 32192];

/**
 * Get registry port (try env var, then defaults)
 */
function getRegistryPorts(): number[] {
  if (process.env.REGISTRY_PORT) {
    return [Number.parseInt(process.env.REGISTRY_PORT, 10)];
  }
  return DEFAULT_REGISTRY_PORTS;
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
      // Not running on this port
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
 * Unregister this server from the registry
 */
export async function unregisterFromRegistry(): Promise<void> {
  const registryPort = await findRegistryPort();

  if (!registryPort) {
    logger.debug('Registry server not found, skipping unregister');
    return;
  }

  try {
    const res = await fetch(`http://localhost:${registryPort}/unregister`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pid: process.pid }),
      signal: AbortSignal.timeout(2000),
    });

    if (res.ok) {
      logger.info('Unregistered from registry server');
    }
  } catch (err) {
    logger.debug({ err }, 'Error unregistering from registry (may already be down)');
  }
}
