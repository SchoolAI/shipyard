import type { Env } from '../env';

const PRODUCTION_BASE_URL = 'https://shipyard-session-server.jacob-191.workers.dev';
const DEVELOPMENT_BASE_URL = 'http://localhost:4444';

export function getBaseUrl(env: Env): string {
  return env.ENVIRONMENT === 'production' ? PRODUCTION_BASE_URL : DEVELOPMENT_BASE_URL;
}
