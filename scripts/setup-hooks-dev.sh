#!/bin/bash
# Setup local development hooks in Claude settings

set -e

# Get the repo root (directory containing this script's parent)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SHIPYARD_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SETTINGS_FILE="$HOME/.claude/settings.json"
BACKUP_FILE="$HOME/.claude/settings.json.backup-$(date +%s)"

echo "🔧 Setting up Shipyard hooks for local development..."

# Backup current settings
if [ -f "$SETTINGS_FILE" ]; then
    echo "📦 Backing up settings to: $BACKUP_FILE"
    cp "$SETTINGS_FILE" "$BACKUP_FILE"
fi

# Use jq to update the hooks to point to local build
if ! command -v jq &> /dev/null; then
    echo "❌ Error: jq is required but not installed"
    echo "Install with: brew install jq"
    exit 1
fi

echo "✏️  Updating hooks to use local build..."

# Update hooks to use absolute path to local build
# NOTE: Path must be quoted to handle spaces in directory names
HOOK_CMD=$(printf 'node "%s"' "$SHIPYARD_ROOT/apps/hook/dist/index.js")
jq --arg hook_path "$HOOK_CMD" '
  # Remove any existing AskUserQuestion hook, then add fresh one with correct path
  .hooks.PreToolUse = (
    [.hooks.PreToolUse[] | select(.matcher != "AskUserQuestion")] +
    [{
      "matcher": "AskUserQuestion",
      "hooks": [{
        "type": "command",
        "command": $hook_path
      }]
    }]
  ) |
  # Update SessionStart hooks
  .hooks.SessionStart = [.hooks.SessionStart[] |
    if .hooks[0].command == "shipyard-hook --context" or .hooks[0].command == "peer-plan-hook --context"
    then .hooks[0].command = ($hook_path + " --context")
    else .
    end
  ] |

  # Update PermissionRequest hooks
  .hooks.PermissionRequest = [.hooks.PermissionRequest[] |
    if .matcher == "ExitPlanMode" and (.hooks[0].command == "shipyard-hook" or .hooks[0].command == "peer-plan-hook")
    then .hooks[0].command = $hook_path
    else .
    end
  ] |

  # Update existing PreToolUse hooks (peer-plan-hook or shipyard-hook → local path)
  .hooks.PreToolUse = [.hooks.PreToolUse[] |
    if .matcher == "AskUserQuestion" then
      .  # Already set with correct path above
    elif (.hooks[0].command | test("shipyard-hook|peer-plan-hook"))
    then .hooks[0].command = $hook_path
    else .
    end
  ] |

  # Update PostToolUse hooks
  .hooks.PostToolUse = [.hooks.PostToolUse[] |
    if .matcher == "ExitPlanMode" and (.hooks[0].command == "shipyard-hook" or .hooks[0].command == "peer-plan-hook")
    then .hooks[0].command = $hook_path
    else .
    end
  ]
' "$SETTINGS_FILE" > "$SETTINGS_FILE.tmp"

mv "$SETTINGS_FILE.tmp" "$SETTINGS_FILE"

echo "✅ Local development hooks configured!"
echo ""
echo "Hooks now point to: $SHIPYARD_ROOT/apps/hook/dist/index.js"
echo ""
echo "📚 See docs/SETUP.md for usage guide and troubleshooting"
echo ""
echo "Next steps:"
echo "  1. Make changes to hook code"
echo "  2. Rebuild: pnpm --filter @shipyard/hook build"
echo "  3. Test in Claude Code (hooks use local build)"
echo "  4. Restore: ./scripts/restore-hooks-prod.sh"
