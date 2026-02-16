import { z } from 'zod';

export const EnvSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  SHIPYARD_DATA_DIR: z.string().default('~/.shipyard/data'),
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
