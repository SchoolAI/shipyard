#!/bin/bash
# Setup local development hooks in Claude settings

set -e

SHIPYARD_ROOT="/Users/jacobpetterle/Working Directory/shipyard"
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
jq --arg hook_path "node $SHIPYARD_ROOT/apps/hook/dist/index.js" '
  # Add AskUserQuestion PreToolUse hook if it doesn'\''t exist
  .hooks.PreToolUse = (
    if (.hooks.PreToolUse | map(.matcher == "AskUserQuestion") | any) then
      .hooks.PreToolUse
    else
      [{
        "matcher": "AskUserQuestion",
        "hooks": [{
          "type": "command",
          "command": $hook_path
        }]
      }] + .hooks.PreToolUse
    end
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

  # Update existing PreToolUse hooks (but not the AskUserQuestion one we just added)
  .hooks.PreToolUse = [.hooks.PreToolUse[] |
    if .matcher == "AskUserQuestion" then
      .
    elif (.hooks[0].command == "shipyard-hook" or .hooks[0].command == "peer-plan-hook")
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
