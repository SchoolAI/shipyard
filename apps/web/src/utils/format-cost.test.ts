import { describe, expect, it } from 'vitest';
import { formatCostUsd } from './format-cost';

describe('formatCostUsd', () => {
  it('returns null for null', () => {
    expect(formatCostUsd(null)).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(formatCostUsd(undefined)).toBeNull();
  });

  it('returns null for 0', () => {
    expect(formatCostUsd(0)).toBeNull();
  });

  it('returns null for negative values', () => {
    expect(formatCostUsd(-1.5)).toBeNull();
  });

  it('returns null for NaN', () => {
    expect(formatCostUsd(NaN)).toBeNull();
  });

  it('returns null for Infinity', () => {
    expect(formatCostUsd(Infinity)).toBeNull();
  });

  it('formats $0.05 with 2 decimal places', () => {
    expect(formatCostUsd(0.05)).toBe('$0.05');
  });

  it('formats $1.23 with 2 decimal places', () => {
    expect(formatCostUsd(1.23)).toBe('$1.23');
  });

  it('formats $15.47 with 2 decimal places', () => {
    expect(formatCostUsd(15.47)).toBe('$15.47');
  });

  it('formats tiny cost $0.001 with 4 decimal places', () => {
    expect(formatCostUsd(0.001)).toBe('$0.0010');
  });

  it('formats tiny cost $0.0045 with 4 decimal places', () => {
    expect(formatCostUsd(0.0045)).toBe('$0.0045');
  });
});
