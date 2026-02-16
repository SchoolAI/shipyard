import { ROUTES } from '@shipyard/session';
import { z } from 'zod';
import { readConfig, type ShipyardConfig, writeConfig } from '../auth.js';
import { print, printError } from './output.js';

const DEFAULT_SIGNALING_URL = 'https://shipyard-session-server.jacob-191.workers.dev';

const DeviceStartResponseSchema = z.object({
  deviceCode: z.string(),
  userCode: z.string(),
  verificationUri: z.string(),
  expiresIn: z.number(),
  interval: z.number(),
});

const DevicePollResponseSchema = z.object({
  token: z.string(),
  user: z.object({
    id: z.string(),
    displayName: z.string(),
    providers: z.array(z.string()),
  }),
});

const DevicePollErrorSchema = z.object({
  error: z.string(),
});

type PollData = z.infer<typeof DevicePollResponseSchema>;

function parseJwtExpiry(token: string): number {
  const fallback = Date.now() + 30 * 24 * 60 * 60 * 1000;
  try {
    const payloadB64 = token.split('.')[1];
    if (!payloadB64) return fallback;
    const payload: unknown = JSON.parse(atob(payloadB64));
    const exp = z.object({ exp: z.number() }).safeParse(payload);
    return exp.success ? exp.data.exp * 1000 : fallback;
  } catch {
    return fallback;
  }
}

function buildConfig(pollData: PollData, signalingUrl: string): ShipyardConfig {
  return {
    auth: {
      token: pollData.token,
      userId: pollData.user.id,
      displayName: pollData.user.displayName,
      providers: pollData.user.providers,
      expiresAt: parseJwtExpiry(pollData.token),
      signalingUrl,
    },
  };
}

async function handlePollSuccess(pollData: PollData, signalingUrl: string): Promise<void> {
  const config = buildConfig(pollData, signalingUrl);
  await writeConfig(config);
  print(`\n  Logged in as ${pollData.user.displayName} (${pollData.user.providers.join(', ')})`);
  print('  Token saved to ~/.shipyard/config.json');
}

async function handlePollError(pollRes: Response, interval: number): Promise<void> {
  const errorData = DevicePollErrorSchema.parse(await pollRes.json());

  if (errorData.error === 'expired_token') {
    printError('\n  Authorization expired. Run `shipyard login` again.');
    process.exit(1);
  }

  if (errorData.error === 'slow_down') {
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}

async function startDeviceFlow(signalingUrl: string) {
  const startRes = await fetch(`${signalingUrl}${ROUTES.AUTH_DEVICE_START}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!startRes.ok) {
    printError(`Failed to start device flow: ${startRes.status}`);
    process.exit(1);
  }

  return DeviceStartResponseSchema.parse(await startRes.json());
}

export async function loginCommand(options: { check?: boolean }): Promise<void> {
  if (options.check) {
    return checkLogin();
  }

  const signalingUrl = process.env.SHIPYARD_SIGNALING_URL ?? DEFAULT_SIGNALING_URL;

  print('Starting device authorization...\n');

  const startData = await startDeviceFlow(signalingUrl);

  print(`  Open this URL in your browser:\n`);
  print(`    ${startData.verificationUri}\n`);
  print(`  Your code: ${startData.userCode}\n`);
  print('  Waiting for authorization...');

  const interval = (startData.interval ?? 5) * 1000;
  const deadline = Date.now() + startData.expiresIn * 1000;

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, interval));

    const pollRes = await fetch(`${signalingUrl}${ROUTES.AUTH_DEVICE_POLL}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceCode: startData.deviceCode }),
    });

    if (pollRes.ok) {
      const pollData = DevicePollResponseSchema.parse(await pollRes.json());
      await handlePollSuccess(pollData, signalingUrl);
      return;
    }

    await handlePollError(pollRes, interval);
  }

  printError('\n  Authorization timed out. Run `shipyard login` again.');
  process.exit(1);
}

async function checkLogin(): Promise<void> {
  const config = await readConfig();

  if (!config?.auth?.token) {
    print('Not logged in. Run `shipyard login` to authenticate.');
    process.exit(1);
  }

  if (config.auth.expiresAt < Date.now()) {
    print('Token expired. Run `shipyard login` to re-authenticate.');
    process.exit(1);
  }

  const daysLeft = Math.ceil((config.auth.expiresAt - Date.now()) / (24 * 60 * 60 * 1000));
  print(`Logged in as ${config.auth.displayName} (${config.auth.providers.join(', ')})`);
  print(`Token expires in ${daysLeft} days`);
}
