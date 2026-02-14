import { hostname } from 'node:os';
import { basename } from 'node:path';
import { PersonalRoomConnection } from '@shipyard/session';

const url = process.env.SHIPYARD_SIGNALING_URL;
const token = process.env.SHIPYARD_USER_TOKEN;

if (!url || !token) {
  console.log('[dev-agent] SHIPYARD_SIGNALING_URL or SHIPYARD_USER_TOKEN not set, skipping');
  process.exit(0);
}

const wsUrl = new URL(url);
wsUrl.searchParams.set('token', token);

const machineName = process.env.SHIPYARD_MACHINE_NAME ?? hostname();
const machineId = process.env.SHIPYARD_MACHINE_ID ?? hostname();
const agentId = `dev-agent-${machineId}`;

const conn = new PersonalRoomConnection({ url: wsUrl.toString() });

conn.onStateChange((state) => {
  console.log(`[dev-agent] connection: ${state}`);
  if (state === 'connected') {
    conn.send({
      type: 'register-agent',
      agentId,
      machineId,
      machineName,
      agentType: 'claude-code',
      capabilities: {
        models: [
          {
            id: 'claude-opus-4-6',
            label: 'Claude Opus 4.6',
            provider: 'claude-code',
            supportsReasoning: true,
          },
          {
            id: 'claude-sonnet-4-5-20250929',
            label: 'Claude Sonnet 4.5',
            provider: 'claude-code',
            supportsReasoning: false,
          },
        ],
        environments: [{ path: process.cwd(), name: basename(process.cwd()), branch: 'main' }],
        permissionModes: ['default', 'accept-edits', 'bypass'],
      },
    });
    console.log(`[dev-agent] registered as "${machineName}" (${machineId}), agentId=${agentId}`);
  }
});

conn.onMessage((msg) => {
  if (msg.type === 'agents-list') {
    console.log(`[dev-agent] ${msg.agents.length} agent(s) online`);
  }
});

conn.connect();

async function gracefulShutdown(signal: string): Promise<void> {
  console.log(`[dev-agent] ${signal} received, unregistering...`);
  try {
    conn.send({ type: 'unregister-agent', agentId });
    await new Promise((resolve) => setTimeout(resolve, 200));
  } catch {}
  conn.disconnect();
  process.exit(0);
}

process.on('SIGINT', () => void gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'));
