#!/usr/bin/env bash
#
# Install script for @peer-plan/hook
# Adds hook configuration to Claude Code settings.json
#

set -e

SETTINGS_FILE="$HOME/.claude/settings.json"
HOOK_COMMAND="peer-plan-hook"

echo "🔧 Installing peer-plan hook configuration..."

# Check if settings file exists
if [ ! -f "$SETTINGS_FILE" ]; then
  echo "❌ Claude Code settings not found at $SETTINGS_FILE"
  echo "Please run Claude Code at least once to create settings."
  exit 1
fi

# Backup settings
BACKUP_FILE="$SETTINGS_FILE.backup.$(date +%s)"
cp "$SETTINGS_FILE" "$BACKUP_FILE"
echo "✅ Backed up settings to $BACKUP_FILE"

# Use Node.js to safely modify JSON
node <<'EOF'
const fs = require('fs');
const settingsPath = process.env.HOME + '/.claude/settings.json';

const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));

// Initialize hooks if not present
if (!settings.hooks) {
  settings.hooks = {};
}

// Add PreToolUse hook for all tools in plan mode
if (!settings.hooks.PreToolUse) {
  settings.hooks.PreToolUse = [];
}

// Check if peer-plan hook already exists
const existingHook = settings.hooks.PreToolUse.find(h =>
  h.hooks?.some(hook => hook.command?.includes('peer-plan-hook'))
);

if (!existingHook) {
  settings.hooks.PreToolUse.push({
    matcher: "*",
    hooks: [{
      type: "command",
      command: "peer-plan-hook"
    }]
  });
  console.log('✅ Added PreToolUse hook');
} else {
  console.log('ℹ️  PreToolUse hook already configured');
}

// Add PermissionRequest hook for ExitPlanMode
if (!settings.hooks.PermissionRequest) {
  settings.hooks.PermissionRequest = [];
}

const existingPermHook = settings.hooks.PermissionRequest.find(h =>
  h.hooks?.some(hook => hook.command?.includes('peer-plan-hook'))
);

if (!existingPermHook) {
  settings.hooks.PermissionRequest.push({
    matcher: "ExitPlanMode",
    hooks: [{
      type: "command",
      command: "peer-plan-hook",
      timeout: 1800
    }]
  });
  console.log('✅ Added PermissionRequest hook');
} else {
  console.log('ℹ️  PermissionRequest hook already configured');
}

// Add PostToolUse hook for ExitPlanMode (injects session context)
if (!settings.hooks.PostToolUse) {
  settings.hooks.PostToolUse = [];
}

const existingPostHook = settings.hooks.PostToolUse.find(h =>
  h.hooks?.some(hook => hook.command?.includes('peer-plan-hook'))
);

if (!existingPostHook) {
  settings.hooks.PostToolUse.push({
    matcher: "ExitPlanMode",
    hooks: [{
      type: "command",
      command: "peer-plan-hook"
    }]
  });
  console.log('✅ Added PostToolUse hook');
} else {
  console.log('ℹ️  PostToolUse hook already configured');
}

// Add SessionStart hook (injects peer-plan context)
if (!settings.hooks.SessionStart) {
  settings.hooks.SessionStart = [];
}

const existingSessionHook = settings.hooks.SessionStart.find(h =>
  h.hooks?.some(hook => hook.command?.includes('peer-plan-hook --context'))
);

if (!existingSessionHook) {
  settings.hooks.SessionStart.push({
    hooks: [{
      type: "command",
      command: "peer-plan-hook --context"
    }]
  });
  console.log('✅ Added SessionStart hook');
} else {
  console.log('ℹ️  SessionStart hook already configured');
}

fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
console.log('✅ Settings updated');
EOF

echo ""
echo "🎉 Installation complete!"
echo ""
echo "Next steps:"
echo "1. Restart Claude Code to activate hooks"
echo "2. Enter plan mode (Shift+Tab) in any project"
echo "3. Create a plan - browser should auto-open with peer-plan"
echo ""
echo "To uninstall:"
echo "  npm uninstall -g @peer-plan/hook"
echo "  Restore settings: cp $BACKUP_FILE $SETTINGS_FILE"
