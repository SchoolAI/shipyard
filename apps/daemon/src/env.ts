import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';

function isDevMode(): boolean {
  return process.env.SHIPYARD_DEV === '1' || process.env.SHIPYARD_DEV === 'true';
}

function shipyardDirName(): string {
  return isDevMode() ? '.shipyard-dev' : '.shipyard';
}

export function getShipyardHome(): string {
  return join(homedir(), shipyardDirName());
}

export const EnvSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  SHIPYARD_DEV: z
    .enum(['1', 'true', '0', 'false', ''])
    .optional()
    .transform((v) => v === '1' || v === 'true'),
  SHIPYARD_DATA_DIR: z
    .string()
    .optional()
    .transform((v) => v ?? `~/${shipyardDirName()}/data`),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  SHIPYARD_SIGNALING_URL: z.string().url().optional(),
  SHIPYARD_USER_TOKEN: z.string().optional(),
  SHIPYARD_USER_ID: z.string().optional(),
  SHIPYARD_MACHINE_ID: z.string().optional(),
  SHIPYARD_MACHINE_NAME: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

export function validateEnv(): Env {
  return EnvSchema.parse(process.env);
}
