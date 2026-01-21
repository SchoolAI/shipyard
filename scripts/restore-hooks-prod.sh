#!/bin/bash
# Restore production hooks (use npm binaries instead of local build)

set -e

SETTINGS_FILE="$HOME/.claude/settings.json"
BACKUP_FILE="$HOME/.claude/settings.json.backup-$(date +%s)"

echo "🔄 Restoring Shipyard hooks to use production binaries..."

# Backup current settings
if [ -f "$SETTINGS_FILE" ]; then
    echo "📦 Backing up settings to: $BACKUP_FILE"
    cp "$SETTINGS_FILE" "$BACKUP_FILE"
fi

# Use jq to restore hooks to use shipyard-hook binary
if ! command -v jq &> /dev/null; then
    echo "❌ Error: jq is required but not installed"
    echo "Install with: brew install jq"
    exit 1
fi

echo "✏️  Updating hooks to use shipyard-hook binary..."

jq '
  # Update SessionStart hooks
  .hooks.SessionStart = [.hooks.SessionStart[] |
    if (.hooks[0].command | startswith("node ")) and (.hooks[0].command | contains("shipyard/apps/hook"))
    then .hooks[0].command = "shipyard-hook --context"
    else .
    end
  ] |

  # Update PermissionRequest hooks
  .hooks.PermissionRequest = [.hooks.PermissionRequest[] |
    if .matcher == "ExitPlanMode" and (.hooks[0].command | startswith("node ")) and (.hooks[0].command | contains("shipyard/apps/hook"))
    then .hooks[0].command = "shipyard-hook"
    else .
    end
  ] |

  # Update PreToolUse hooks
  .hooks.PreToolUse = [.hooks.PreToolUse[] |
    if (.hooks[0].command | startswith("node ")) and (.hooks[0].command | contains("shipyard/apps/hook"))
    then .hooks[0].command = "shipyard-hook"
    else .
    end
  ] |

  # Update PostToolUse hooks
  .hooks.PostToolUse = [.hooks.PostToolUse[] |
    if .matcher == "ExitPlanMode" and (.hooks[0].command | startswith("node ")) and (.hooks[0].command | contains("shipyard/apps/hook"))
    then .hooks[0].command = "shipyard-hook"
    else .
    end
  ]
' "$SETTINGS_FILE" > "$SETTINGS_FILE.tmp"

mv "$SETTINGS_FILE.tmp" "$SETTINGS_FILE"

echo "✅ Production hooks restored!"
echo ""
echo "Hooks now use: shipyard-hook (npm binary)"
echo ""
echo "To restore previous settings:"
echo "  cp $BACKUP_FILE $SETTINGS_FILE"
