import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { z } from 'zod';

const ShipyardConfigSchema = z.object({
  auth: z.object({
    token: z.string(),
    userId: z.string(),
    displayName: z.string(),
    providers: z.array(z.string()),
    expiresAt: z.number(),
    signalingUrl: z.string(),
  }),
});

export type ShipyardConfig = z.infer<typeof ShipyardConfigSchema>;

const CONFIG_PATH = join(homedir(), '.shipyard', 'config.json');

export async function readConfig(): Promise<ShipyardConfig | null> {
  try {
    const raw = await readFile(CONFIG_PATH, 'utf-8');
    return ShipyardConfigSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function writeConfig(config: ShipyardConfig): Promise<void> {
  await mkdir(dirname(CONFIG_PATH), { recursive: true, mode: 0o700 });
  await writeFile(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
}

export async function deleteConfig(): Promise<boolean> {
  try {
    await unlink(CONFIG_PATH);
    return true;
  } catch {
    return false;
  }
}

export type AuthResult =
  | { status: 'ok'; token: string; signalingUrl?: string }
  | { status: 'expired' }
  | { status: 'missing' };

/**
 * Load auth token from env var (CI override) or config file.
 */
export async function loadAuthToken(): Promise<AuthResult> {
  const envToken = process.env.SHIPYARD_USER_TOKEN;
  if (envToken) {
    return { status: 'ok', token: envToken, signalingUrl: process.env.SHIPYARD_SIGNALING_URL };
  }

  const config = await readConfig();
  if (!config?.auth?.token) return { status: 'missing' };

  if (config.auth.expiresAt < Date.now()) {
    return { status: 'expired' };
  }

  return { status: 'ok', token: config.auth.token, signalingUrl: config.auth.signalingUrl };
}
