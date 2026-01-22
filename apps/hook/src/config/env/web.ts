import { z } from 'zod';
import { loadEnv } from '../config.js';

/**
 * Production URL when NODE_ENV=production, localhost for development.
 * NODE_ENV is set in hooks.json (production) or .mcp.json (development).
 */
const defaultWebUrl =
  process.env.NODE_ENV === 'production'
    ? 'https://schoolai.github.io/shipyard'
    : 'http://localhost:5173';

const schema = z.object({
  SHIPYARD_WEB_URL: z.string().url().default(defaultWebUrl),
});

export const webConfig = loadEnv(schema);
export type WebConfig = z.infer<typeof schema>;
