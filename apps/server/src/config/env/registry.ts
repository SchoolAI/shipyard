import { homedir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_EPOCH } from '@shipyard/schema';
import { DEFAULT_REGISTRY_PORTS } from '@shipyard/shared/registry-config';
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
  SHIPYARD_STATE_DIR: z
    .string()
    .optional()
    .transform((val) => val || undefined)
    .default(() => join(homedir(), '.shipyard')),
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

export const registryConfig = loadEnv(schema);
export type RegistryConfig = z.infer<typeof schema>;
