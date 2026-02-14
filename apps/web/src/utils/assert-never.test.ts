import { describe, expect, it } from 'vitest';
import { assertNever } from './assert-never';

describe('assertNever', () => {
  it('throws with a descriptive message', () => {
    expect(() => assertNever('unexpected' as never)).toThrow('Unexpected value: "unexpected"');
  });

  it('throws for objects', () => {
    expect(() => assertNever({ kind: 'unknown' } as never)).toThrow(
      'Unexpected value: {"kind":"unknown"}'
    );
  });
});
