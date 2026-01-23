import { z } from 'zod';
import { loadEnv } from '../config.js';

/**
 * Web app URL configuration.
 *
 * Defaults to production URL (https://schoolai.github.io/shipyard).
 * For local development, set SHIPYARD_WEB_URL=http://localhost:5173
 */
const schema = z.object({
  SHIPYARD_WEB_URL: z.string().url().default('https://schoolai.github.io/shipyard'),
});

export const webConfig = loadEnv(schema);
export type WebConfig = z.infer<typeof schema>;
