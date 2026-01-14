import { z } from 'zod';
import { loadEnv } from '../config.js';

const schema = z.object({
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export const serverConfig = loadEnv(schema);
export type ServerConfig = z.infer<typeof schema>;
