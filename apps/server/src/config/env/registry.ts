import { homedir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_REGISTRY_PORTS } from '@peer-plan/shared/registry-config';
import { z } from 'zod';
import { loadEnv } from '../config.js';

const schema = z.object({
  REGISTRY_PORT: z
    .string()
    .optional()
    .transform((val) => {
      if (!val) return DEFAULT_REGISTRY_PORTS;
      const port = Number.parseInt(val, 10);
      if (Number.isNaN(port)) {
        throw new Error(`REGISTRY_PORT must be a valid number, got: ${val}`);
      }
      return [port];
    }),
  PEER_PLAN_STATE_DIR: z
    .string()
    .optional()
    .default(() => join(homedir(), '.peer-plan')),
});

export const registryConfig = loadEnv(schema);
export type RegistryConfig = z.infer<typeof schema>;
