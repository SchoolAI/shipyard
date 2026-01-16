import { z } from 'zod';
import { loadEnv } from '../config.js';

const schema = z.object({
  // TODO: `url` is deprecated
  PEER_PLAN_WEB_URL: z.string().url().default('http://localhost:5173'),
});

export const webConfig = loadEnv(schema);
export type WebConfig = z.infer<typeof schema>;
