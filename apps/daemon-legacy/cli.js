#!/usr/bin/env node

/**
 * CLI tool for managing Shipyard daemon auto-start
 */

import { setupAutoStart, isAutoStartConfigured, removeAutoStart } from './dist/auto-start.js';

const command = process.argv[2];

async function status() {
  const configured = await isAutoStartConfigured();
  console.log(`Auto-start status: ${configured ? 'ENABLED' : 'DISABLED'}`);

  if (configured) {
    console.log('The daemon will automatically start on machine boot.');
  } else {
    console.log('Run "shipyard-daemon setup" to enable auto-start.');
  }
}

async function setup() {
  console.log('Setting up daemon auto-start...');

  const alreadyConfigured = await isAutoStartConfigured();
  if (alreadyConfigured) {
    console.log('Auto-start is already configured.');
    return;
  }

  const success = await setupAutoStart();
  if (success) {
    console.log('Success! Daemon will now auto-start on machine boot.');
  } else {
    console.error('Failed to configure auto-start.');
    process.exit(1);
  }
}

async function remove() {
  console.log('Removing daemon auto-start...');

  const configured = await isAutoStartConfigured();
  if (!configured) {
    console.log('Auto-start is not configured.');
    return;
  }

  await removeAutoStart();

  const stillConfigured = await isAutoStartConfigured();
  if (stillConfigured) {
    console.error('Failed to remove auto-start configuration.');
    process.exit(1);
  }

  console.log('Auto-start removed successfully.');
}

async function main() {
  switch (command) {
    case 'status':
      await status();
      break;
    case 'setup':
      await setup();
      break;
    case 'remove':
      await remove();
      break;
    case 'help':
    case '--help':
    case '-h':
    case undefined:
      console.log(`
Shipyard Daemon Auto-Start Manager

Usage:
  shipyard-daemon status   - Check auto-start status
  shipyard-daemon setup    - Enable auto-start on boot
  shipyard-daemon remove   - Disable auto-start
  shipyard-daemon help     - Show this help message
`);
      break;
    default:
      console.error(`Unknown command: ${command}`);
      console.log('Run "shipyard-daemon help" for usage information.');
      process.exit(1);
  }
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
