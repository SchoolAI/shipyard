import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { loadEnv } from './config';

describe('loadEnv', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should successfully parse env vars when all required fields are present', () => {
    process.env.TEST_VAR = 'test-value';
    process.env.TEST_NUM = '123';

    const schema = z.object({
      TEST_VAR: z.string(),
      TEST_NUM: z.string(),
    });

    const result = loadEnv(schema);

    expect(result).toEqual({
      TEST_VAR: 'test-value',
      TEST_NUM: '123',
    });
  });

  it('should apply defaults when env vars are missing', () => {
    delete process.env.WITH_DEFAULT;

    const schema = z.object({
      WITH_DEFAULT: z.string().default('default-value'),
    });

    const result = loadEnv(schema);

    expect(result.WITH_DEFAULT).toBe('default-value');
  });

  it('should coerce number types', () => {
    process.env.PORT = '3000';

    const schema = z.object({
      PORT: z.coerce.number(),
    });

    const result = loadEnv(schema);

    expect(result.PORT).toBe(3000);
    expect(typeof result.PORT).toBe('number');
  });

  it('should return undefined when optional schema fails to parse', () => {
    delete process.env.MISSING_VAR;

    const schema = z
      .object({
        MISSING_VAR: z.string(),
      })
      .optional();

    const result = loadEnv(schema);

    expect(result).toBeUndefined();
  });

  it('should throw helpful error when required schema fails to parse', () => {
    delete process.env.REQUIRED_VAR;
    delete process.env.ANOTHER_VAR;

    const schema = z.object({
      REQUIRED_VAR: z.string(),
      ANOTHER_VAR: z.string(),
    });

    expect(() => loadEnv(schema)).toThrow('Environment variable validation failed');
    expect(() => loadEnv(schema)).toThrow('REQUIRED_VAR');
    expect(() => loadEnv(schema)).toThrow('ANOTHER_VAR');
  });

  it('should apply transformations', () => {
    process.env.BOOL_VAR = 'true';

    const schema = z.object({
      BOOL_VAR: z.string().transform((s) => s === 'true'),
    });

    const result = loadEnv(schema);

    expect(result.BOOL_VAR).toBe(true);
    expect(typeof result.BOOL_VAR).toBe('boolean');
  });

  it('should rethrow non-ZodError errors', () => {
    const schema = {
      parse: vi.fn(() => {
        throw new Error('Custom error');
      }),
      safeParse: vi.fn(),
    } as unknown as z.ZodSchema;

    expect(() => loadEnv(schema)).toThrow('Custom error');
    expect(schema.safeParse).not.toHaveBeenCalled();
  });
});
