#!/usr/bin/env node
/**
 * Postinstall script for @shipyard/hook
 *
 * Automatically configures Claude Code hooks in ~/.claude/settings.json
 * This runs after `npm install -g @shipyard/hook`
 */

import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const SETTINGS_FILE = join(homedir(), '.claude', 'settings.json');
const HOOK_COMMAND = 'shipyard-hook';
const HOOK_CONTEXT_COMMAND = 'shipyard-hook --context';

/**
 * Main postinstall function
 */
function main() {
  console.log('\n[shipyard] Configuring Claude Code hooks...\n');

  // Check if settings file exists
  if (!existsSync(SETTINGS_FILE)) {
    console.log('Claude Code settings not found at', SETTINGS_FILE);
    console.log('Please run Claude Code at least once to create settings.\n');
    console.log('After running Claude Code, you can manually run:');
    console.log('  shipyard-hook-install\n');
    // Don't fail - user might not have Claude Code yet
    return;
  }

  // Backup settings
  const timestamp = Date.now();
  const backupFile = `${SETTINGS_FILE}.backup.${timestamp}`;
  copyFileSync(SETTINGS_FILE, backupFile);
  console.log(`Backed up settings to: ${backupFile}\n`);

  // Read current settings
  let settings;
  try {
    settings = JSON.parse(readFileSync(SETTINGS_FILE, 'utf-8'));
  } catch (err) {
    console.error('Failed to parse settings.json:', err.message);
    return;
  }

  // Initialize hooks if not present
  if (!settings.hooks) {
    settings.hooks = {};
  }

  let modified = false;

  // Add PermissionRequest hook for ExitPlanMode (blocks until review approved)
  if (!settings.hooks.PermissionRequest) {
    settings.hooks.PermissionRequest = [];
  }

  const existingPermHook = settings.hooks.PermissionRequest.find((h) =>
    h.hooks?.some(
      (hook) => hook.command?.includes(HOOK_COMMAND) && !hook.command?.includes('--context')
    )
  );

  if (!existingPermHook) {
    settings.hooks.PermissionRequest.push({
      matcher: 'ExitPlanMode',
      hooks: [
        {
          type: 'command',
          command: HOOK_COMMAND,
          timeout: 1800,
        },
      ],
    });
    console.log('Added PermissionRequest hook (ExitPlanMode)');
    modified = true;
  } else {
    console.log('PermissionRequest hook already configured');
  }

  // Add PostToolUse hook for ExitPlanMode (injects session context after approval)
  if (!settings.hooks.PostToolUse) {
    settings.hooks.PostToolUse = [];
  }

  const existingPostHook = settings.hooks.PostToolUse.find((h) =>
    h.hooks?.some((hook) => hook.command?.includes(HOOK_COMMAND))
  );

  if (!existingPostHook) {
    settings.hooks.PostToolUse.push({
      matcher: 'ExitPlanMode',
      hooks: [
        {
          type: 'command',
          command: HOOK_COMMAND,
        },
      ],
    });
    console.log('Added PostToolUse hook (ExitPlanMode)');
    modified = true;
  } else {
    console.log('PostToolUse hook already configured');
  }

  // Add SessionStart hook (injects shipyard context)
  if (!settings.hooks.SessionStart) {
    settings.hooks.SessionStart = [];
  }

  const existingSessionHook = settings.hooks.SessionStart.find((h) =>
    h.hooks?.some((hook) => hook.command?.includes(HOOK_CONTEXT_COMMAND))
  );

  if (!existingSessionHook) {
    settings.hooks.SessionStart.push({
      hooks: [
        {
          type: 'command',
          command: HOOK_CONTEXT_COMMAND,
        },
      ],
    });
    console.log('Added SessionStart hook (context injection)');
    modified = true;
  } else {
    console.log('SessionStart hook already configured');
  }

  // Write updated settings
  if (modified) {
    writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8');
    console.log('\nSettings updated successfully!\n');
  } else {
    console.log('\nNo changes needed - hooks already configured.\n');
  }

  // Print next steps
  console.log('='.repeat(50));
  console.log('  Installation complete!');
  console.log('='.repeat(50));
  console.log('\nNext steps:');
  console.log('1. Restart Claude Code to activate hooks');
  console.log('2. Enter plan mode (Shift+Tab) in any project');
  console.log('3. Create a plan - browser will auto-open with Shipyard');
  console.log('\nTo uninstall:');
  console.log('  npm uninstall -g @shipyard/hook');
  console.log(`  Restore settings: cp ${backupFile} ${SETTINGS_FILE}`);
  console.log('');
}

// Run
main();
