#!/bin/bash
# Enable local development hooks
# This copies hooks from .claude/hooks-local.json into .claude/settings.local.json

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

HOOKS_LOCAL="$REPO_ROOT/.claude/hooks-local.json"
SETTINGS_LOCAL="$REPO_ROOT/.claude/settings.local.json"

if [ ! -f "$HOOKS_LOCAL" ]; then
  echo "Error: $HOOKS_LOCAL not found"
  exit 1
fi

# Extract hooks from hooks-local.json
HOOKS=$(jq '.hooks' "$HOOKS_LOCAL")

if [ ! -f "$SETTINGS_LOCAL" ]; then
  # Create new settings.local.json with just hooks
  echo "{\"hooks\": $HOOKS}" | jq '.' > "$SETTINGS_LOCAL"
else
  # Merge hooks into existing settings.local.json
  jq --argjson hooks "$HOOKS" '.hooks = $hooks' "$SETTINGS_LOCAL" > "$SETTINGS_LOCAL.tmp"
  mv "$SETTINGS_LOCAL.tmp" "$SETTINGS_LOCAL"
fi

echo "✅ Local hooks enabled in .claude/settings.local.json"
echo ""
echo "⚠️  Don't forget to disable the production plugin:"
echo "   claude plugin disable shipyard@SchoolAI"
echo ""
echo "To switch back to prod hooks, run:"
echo "   pnpm hooks:prod"
