import { describe, expect, it, vi } from 'vitest';

vi.mock('../stores', () => ({
  useUIStore: vi.fn(() => 'dark'),
}));

describe('useThemeEffect', () => {
  it('module loads without error', async () => {
    const mod = await import('./use-theme-effect');
    expect(mod.useThemeEffect).toBeDefined();
  });
});
