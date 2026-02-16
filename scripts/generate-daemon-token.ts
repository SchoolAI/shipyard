/**
 * Generate a Shipyard JWT for the daemon's .env file.
 *
 * Usage:
 *   pnpm tsx scripts/generate-daemon-token.ts --user-id 45721962 --username jacob-petterle
 *   pnpm tsx scripts/generate-daemon-token.ts --user-id 45721962 --username jacob-petterle --expiry-days 7
 *
 * Reads JWT_SECRET from apps/session-server/.dev.vars automatically.
 * Outputs the .env block ready to paste into apps/daemon/.env.
 */

import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);

function getArg(name: string): string | undefined {
	const idx = args.indexOf(`--${name}`);
	if (idx === -1 || idx + 1 >= args.length) return undefined;
	return args[idx + 1];
}

const userId = getArg('user-id');
const username = getArg('username');
const expiryDays = Number(getArg('expiry-days') ?? '30');

if (!userId || !username) {
	console.error('Usage: pnpm tsx scripts/generate-daemon-token.ts --user-id <GITHUB_ID> --username <GITHUB_USERNAME> [--expiry-days <N>]');
	console.error('');
	console.error('  --user-id       Your numeric GitHub user ID');
	console.error('                  Find it: curl -s https://api.github.com/users/YOUR_USERNAME | jq .id');
	console.error('  --username      Your GitHub username');
	console.error('  --expiry-days   Token lifetime in days (default: 30)');
	process.exit(1);
}

const ghId = Number(userId);
if (Number.isNaN(ghId)) {
	console.error(`Error: --user-id must be a number, got "${userId}"`);
	process.exit(1);
}

const scriptDir = decodeURIComponent(new URL('.', import.meta.url).pathname);
const devVarsPath = resolve(scriptDir, '..', 'apps', 'session-server', '.dev.vars');

let jwtSecret: string;
try {
	const content = readFileSync(devVarsPath, 'utf-8');
	const match = content.match(/^JWT_SECRET=(.+)$/m);
	if (!match?.[1]) {
		console.error(`Error: JWT_SECRET not found in ${devVarsPath}`);
		process.exit(1);
	}
	jwtSecret = match[1].trim();
} catch {
	console.error(`Error: Could not read ${devVarsPath}`);
	console.error('Make sure apps/session-server/.dev.vars exists with a JWT_SECRET value.');
	process.exit(1);
}

function base64UrlEncode(data: string): string {
	return Buffer.from(data).toString('base64url');
}

function hmacSign(data: string, secret: string): string {
	return createHmac('sha256', secret).update(data).digest('base64url');
}

const now = Math.floor(Date.now() / 1000);
const sub = `gh_${ghId}`;

const claims = {
	sub,
	ghUser: username,
	ghId,
	iat: now,
	exp: now + expiryDays * 24 * 60 * 60,
};

const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
const payload = base64UrlEncode(JSON.stringify(claims));
const signature = hmacSign(`${header}.${payload}`, jwtSecret);
const token = `${header}.${payload}.${signature}`;

const expDate = new Date(claims.exp * 1000);

console.log('# ---- Generated daemon token ----');
console.log(`# User: ${username} (${sub})`);
console.log(`# Expires: ${expDate.toISOString()} (${expiryDays} days)`);
console.log('#');
console.log('# Paste these into apps/daemon/.env:');
console.log('');
console.log(`SHIPYARD_SIGNALING_URL=ws://localhost:4444/personal/${sub}`);
console.log(`SHIPYARD_USER_TOKEN=${token}`);
