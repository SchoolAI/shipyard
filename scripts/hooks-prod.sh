#!/bin/bash
# Disable local development hooks (switch back to production plugin)
# This removes hooks from .claude/settings.local.json

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

SETTINGS_LOCAL="$REPO_ROOT/.claude/settings.local.json"

if [ ! -f "$SETTINGS_LOCAL" ]; then
  echo "No .claude/settings.local.json found - nothing to do"
  exit 0
fi

# Remove hooks key from settings.local.json
if jq 'has("hooks")' "$SETTINGS_LOCAL" | grep -q true; then
  jq 'del(.hooks)' "$SETTINGS_LOCAL" > "$SETTINGS_LOCAL.tmp"
  mv "$SETTINGS_LOCAL.tmp" "$SETTINGS_LOCAL"
  echo "✅ Local hooks removed from .claude/settings.local.json"
else
  echo "No hooks found in .claude/settings.local.json - nothing to do"
fi

echo ""
echo "⚠️  Don't forget to re-enable the production plugin:"
echo "   claude plugin enable shipyard@SchoolAI"
echo ""
echo "To switch back to local hooks, run:"
echo "   pnpm hooks:local"
