import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { nanoid } from 'nanoid';

const PEER_PLAN_DIR = join(homedir(), '.peer-plan');
const SERVER_ID_FILE = join(PEER_PLAN_DIR, 'server-id');

let cachedServerId: string | null = null;

export function getServerId(): string {
  if (cachedServerId) {
    return cachedServerId;
  }

  mkdirSync(PEER_PLAN_DIR, { recursive: true });

  if (existsSync(SERVER_ID_FILE)) {
    cachedServerId = readFileSync(SERVER_ID_FILE, 'utf-8').trim();
    return cachedServerId;
  }

  cachedServerId = nanoid();
  writeFileSync(SERVER_ID_FILE, cachedServerId, 'utf-8');
  return cachedServerId;
}
