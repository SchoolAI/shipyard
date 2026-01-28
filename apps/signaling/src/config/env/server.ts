import { DEFAULT_EPOCH } from '@shipyard/schema';
import { z } from 'zod';
import { loadEnv } from '../config.js';

const schema = z.object({
  PORT: z.coerce.number().default(4444),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  /*
   * WARNING: This value MUST match the registry server's MINIMUM_EPOCH.
   * Mismatched values allow clients to bypass validation.
   */
  MINIMUM_EPOCH: z
    .string()
    .optional()
    .transform((val) => {
      if (!val) return DEFAULT_EPOCH;
      const epoch = Number.parseInt(val, 10);
      if (Number.isNaN(epoch) || epoch < 1) {
        throw new Error(`MINIMUM_EPOCH must be a positive integer, got: ${val}`);
      }
      return epoch;
    }),
});

export const serverConfig = loadEnv(schema);
export type ServerConfig = z.infer<typeof schema>;
