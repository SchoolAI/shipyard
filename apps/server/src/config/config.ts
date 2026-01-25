import { z } from 'zod';

/**
 * Load and validate environment variables using a Zod schema.
 *
 * This function provides type-safe access to environment variables with runtime validation.
 * It follows the pattern from the power-up server for consistency across projects.
 *
 * @template T - Zod schema type
 * @param schema - Zod schema defining the environment variables structure
 * @returns Validated and typed environment configuration
 * @throws Error with helpful message if validation fails
 *
 * @example
 * ```typescript
 * const schema = z.object({
 *   PORT: z.coerce.number().default(3000),
 *   NODE_ENV: z.enum(['development', 'production']).default('development'),
 * });
 *
 * export const config = loadEnv(schema);
 *
 *
 * ```
 */
export function loadEnv<T extends z.ZodSchema>(schema: T): z.infer<T> {
  try {
    return schema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const testResult = schema.safeParse(undefined);
      if (testResult.success) {
        return testResult.data;
      }
      /** Format validation errors with helpful messages */
      if (!error.issues || !Array.isArray(error.issues)) {
        throw new Error('Environment variable validation failed (no error details available)');
      }
      const errorMessages = error.issues
        .map((err) => ` - ${err.path.join('.')}: ${err.message}`)
        .join('\n');
      throw new Error(`Environment variable validation failed: \n${errorMessages}`);
    }
    throw error;
  }
}
