import { ROUTES } from '@shipyard/session';
import { z } from 'zod';
import { getConfigPath, readConfig, type ShipyardConfig, writeConfig } from '../auth.js';
import { isDevMode } from '../env.js';
import { print, printError } from './output.js';

const DEFAULT_SIGNALING_URL = 'https://shipyard-session-server.jacob-191.workers.dev';
const DEFAULT_DEV_SIGNALING_URL = 'http://localhost:4444';

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

export async function loginCommand(options: { check?: boolean }): Promise<void> {
  if (options.check) {
    return checkLogin();
  }

  const signalingUrl =
    process.env.SHIPYARD_SIGNALING_URL ??
    (isDevMode() ? DEFAULT_DEV_SIGNALING_URL : DEFAULT_SIGNALING_URL);
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
      await handleSuccessfulPoll(pollRes, signalingUrl);
      return;
    }

    await handlePollError(pollRes, interval);
  }

  printError('\n  Authorization timed out. Run `shipyard login` again.');
  process.exit(1);
}

async function startDeviceFlow(signalingUrl: string) {
  print('Starting device authorization...\n');

  let startRes: Response;
  try {
    startRes = await fetch(`${signalingUrl}${ROUTES.AUTH_DEVICE_START}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    printError(`Could not reach signaling server at ${signalingUrl}`);
    printError('Check your internet connection or set SHIPYARD_SIGNALING_URL.');
    process.exit(1);
  }

  if (!startRes.ok) {
    printError(`Failed to start device flow: ${startRes.status}`);
    process.exit(1);
  }

  return DeviceStartResponseSchema.parse(await startRes.json());
}

function extractTokenExpiry(token: string): number {
  const fallback = Date.now() + 30 * 24 * 60 * 60 * 1000;
  try {
    const payloadB64 = token.split('.')[1];
    if (!payloadB64) return fallback;
    const payload: unknown = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
    const exp = z.object({ exp: z.number() }).safeParse(payload);
    return exp.success ? exp.data.exp * 1000 : fallback;
  } catch {
    return fallback;
  }
}

async function handleSuccessfulPoll(pollRes: Response, signalingUrl: string): Promise<void> {
  const pollData = DevicePollResponseSchema.parse(await pollRes.json());
  const expiresAt = extractTokenExpiry(pollData.token);

  const config: ShipyardConfig = {
    auth: {
      token: pollData.token,
      userId: pollData.user.id,
      displayName: pollData.user.displayName,
      providers: pollData.user.providers,
      expiresAt,
      signalingUrl,
    },
  };

  await writeConfig(config);

  print(`\n  Logged in as ${pollData.user.displayName} (${pollData.user.providers.join(', ')})`);
  print(`  Token saved to ${getConfigPath()}`);
}

async function handlePollError(pollRes: Response, interval: number): Promise<void> {
  try {
    const errorData = DevicePollErrorSchema.parse(await pollRes.json());

    if (errorData.error === 'expired_token') {
      printError('\n  Authorization expired. Run `shipyard login` again.');
      process.exit(1);
    }

    if (errorData.error === 'slow_down') {
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
  } catch {
    /* non-JSON response — keep polling */
  }
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
