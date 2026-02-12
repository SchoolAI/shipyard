import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe('LifecycleManager', () => {
  let originalListeners: Array<{
    event: string | symbol;
    listener: (...args: unknown[]) => void;
  }>;

  beforeEach(() => {
    vi.useFakeTimers();
    originalListeners = [];

    // Track listeners added during tests so we can clean them up
    const originalOn = process.on.bind(process);
    vi.spyOn(process, 'on').mockImplementation(
      // eslint-disable-next-line no-restricted-syntax -- process.on overloads require broad signature
      ((event: string, listener: (...args: unknown[]) => void) => {
        originalListeners.push({ event, listener });
        return originalOn(event, listener);
      }) as typeof process.on,
    );

    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    for (const { event, listener } of originalListeners) {
      process.removeListener(event as string, listener);
    }
  });

  it('does not call process.exit immediately after shutdown log -- waits for flush', async () => {
    const { LifecycleManager } = await import('./lifecycle.js');
    // Instantiation registers signal handlers; we need the side effect
    new LifecycleManager();

    const mockExit = vi.mocked(process.exit);

    // Trigger SIGTERM handler
    const sigTermListener = originalListeners.find((l) => l.event === 'SIGTERM');
    expect(sigTermListener).toBeDefined();

    // Fire the handler (async)
    const shutdownPromise = sigTermListener!.listener();

    // At this point, 'Shutdown complete' has been logged but process.exit should
    // NOT have been called yet because we need a flush delay
    expect(mockExit).not.toHaveBeenCalled();

    // Advance timers past the flush delay (100ms)
    await vi.advanceTimersByTimeAsync(150);

    await shutdownPromise;

    // Now process.exit should have been called
    expect(mockExit).toHaveBeenCalledWith(0);
  });
});
