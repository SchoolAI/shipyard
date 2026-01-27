import { z } from 'zod';
import { loadEnv } from '../config.js';

/**
 * Web app URL configuration.
 *
 * Uses NODE_ENV-based defaults:
 * - development (default): http://localhost:5173
 * - production: https://schoolai.github.io/shipyard
 *
 * Can be overridden with SHIPYARD_WEB_URL environment variable.
 */
const schema = z.object({
  SHIPYARD_WEB_URL: z
    .string()
    .url()
    .default(() => {
      const nodeEnv = process.env.NODE_ENV || 'development';
      return nodeEnv === 'production'
        ? 'https://schoolai.github.io/shipyard'
        : 'http://localhost:5173';
    }),
});

export const webConfig = loadEnv(schema);
export type WebConfig = z.infer<typeof schema>;
