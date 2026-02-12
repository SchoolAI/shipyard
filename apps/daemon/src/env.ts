import { z } from 'zod';

export const EnvSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1),
  SHIPYARD_DATA_DIR: z.string().default('~/.shipyard/data'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type Env = z.infer<typeof EnvSchema>;

export function validateEnv(): Env {
  return EnvSchema.parse(process.env);
}
