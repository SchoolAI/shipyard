import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { daemonConfig } from '@/config/daemon';

const { DAEMON_HTTP_URL, DAEMON_HEALTH_CHECK_INTERVAL_MS, DAEMON_HEALTH_CHECK_TIMEOUT_MS } =
  daemonConfig;

export interface DaemonHealth {
  status: 'ok' | 'error' | 'unknown';
  uptime?: number;
  message?: string;
  lastChecked: number;
}

export interface UseDaemonReturn {
  isAvailable: boolean;
  isChecking: boolean;
  health: DaemonHealth;
  checkHealth: () => Promise<DaemonHealth>;
}

let daemonHealth: DaemonHealth = {
  status: 'unknown',
  lastChecked: 0,
};
let isChecking = false;
const listeners = new Set<() => void>();
let healthCheckInterval: ReturnType<typeof setInterval> | null = null;
let activeCheckPromise: Promise<DaemonHealth> | null = null;

let cachedSnapshot: { health: DaemonHealth; isChecking: boolean } = {
  health: daemonHealth,
  isChecking,
};

function updateCachedSnapshot(): void {
  if (cachedSnapshot.health !== daemonHealth || cachedSnapshot.isChecking !== isChecking) {
    cachedSnapshot = { health: daemonHealth, isChecking };
  }
}

function notifyListeners(): void {
  updateCachedSnapshot();
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

function getSnapshot(): { health: DaemonHealth; isChecking: boolean } {
  return cachedSnapshot;
}

const serverSnapshot = {
  health: { status: 'unknown' as const, lastChecked: 0 },
  isChecking: false,
};

function getServerSnapshot(): { health: DaemonHealth; isChecking: boolean } {
  return serverSnapshot;
}

function createErrorHealth(message: string): DaemonHealth {
  return {
    status: 'error',
    message,
    lastChecked: Date.now(),
  };
}

function getErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'Unknown error checking daemon health';
  }
  if (error.name === 'AbortError') {
    return 'Health check timed out - daemon not responding';
  }
  if (error.message.includes('fetch')) {
    return 'Daemon not running or unreachable';
  }
  return error.message;
}

async function performHealthCheck(): Promise<DaemonHealth> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DAEMON_HEALTH_CHECK_TIMEOUT_MS);

  try {
    const response = await fetch(`${DAEMON_HTTP_URL}/health`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
      return createErrorHealth(errorData.message || `HTTP ${response.status}`);
    }

    const data = await response.json();
    return {
      status: data.status === 'ok' ? 'ok' : 'error',
      uptime: data.uptime,
      message: data.message,
      lastChecked: Date.now(),
    };
  } catch (error) {
    clearTimeout(timeoutId);
    return createErrorHealth(getErrorMessage(error));
  }
}

async function checkDaemonHealth(): Promise<DaemonHealth> {
  if (activeCheckPromise) {
    return activeCheckPromise;
  }

  isChecking = true;
  notifyListeners();

  activeCheckPromise = (async (): Promise<DaemonHealth> => {
    try {
      daemonHealth = await performHealthCheck();
      return daemonHealth;
    } finally {
      isChecking = false;
      activeCheckPromise = null;
      notifyListeners();
    }
  })();

  return activeCheckPromise;
}

function startHealthCheckInterval(): void {
  if (healthCheckInterval) return;

  checkDaemonHealth();

  healthCheckInterval = setInterval(() => {
    checkDaemonHealth();
  }, DAEMON_HEALTH_CHECK_INTERVAL_MS);
}

function stopHealthCheckInterval(): void {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
    healthCheckInterval = null;
  }
}

export function useDaemon(): UseDaemonReturn {
  const mountedRef = useRef(true);

  const { health, isChecking: checking } = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot
  );

  useEffect(() => {
    mountedRef.current = true;
    startHealthCheckInterval();

    return () => {
      mountedRef.current = false;
      if (listeners.size === 0) {
        stopHealthCheckInterval();
      }
    };
  }, []);

  const checkHealth = useCallback(async (): Promise<DaemonHealth> => {
    return checkDaemonHealth();
  }, []);

  return {
    isAvailable: health.status === 'ok',
    isChecking: checking,
    health,
    checkHealth,
  };
}

export function resetDaemonState(): void {
  daemonHealth = { status: 'unknown', lastChecked: 0 };
  isChecking = false;
  activeCheckPromise = null;
  stopHealthCheckInterval();
  listeners.clear();
}
