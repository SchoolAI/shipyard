#!/usr/bin/env bash
# Run shipyard locally in production-like mode
# - Web app runs locally (instead of GitHub Pages)
# - Agents (Claude, Cursor, etc.) spawn their own MCP server + registry
# Usage: pnpm dev:local
# Usage with custom port: PORT=5174 pnpm dev:local

set -e

# Default port, can override with PORT env var
PORT=${PORT:-5173}
export SHIPYARD_WEB_URL="http://localhost:$PORT"

echo "🧹 Cleaning up stale processes..."
pkill -f "node.*server.*index.mjs" 2>/dev/null || true
pkill -f "node.*registry" 2>/dev/null || true

echo "🔨 Building hook..."
pnpm build --filter=@shipyard/hook

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Ready to test!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
if [ "$PORT" != "5173" ]; then
  echo "⚠️  Custom port: Update ~/.claude/settings.json:"
  echo "    \"env\": { \"SHIPYARD_WEB_URL\": \"http://localhost:$PORT\" }"
  echo ""
fi
echo "Next steps:"
echo "  1. Restart Claude Code: /quit then 'claude'"
echo "  2. Enter plan mode (Shift+Tab)"
echo "  3. Ask Claude to plan something"
echo "  4. Exit plan mode → browser opens"
echo "  5. Click Approve → Claude continues!"
echo ""
echo "Starting web app on http://localhost:$PORT..."
echo "SHIPYARD_WEB_URL=$SHIPYARD_WEB_URL"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

pnpm dev:web -- --port $PORT
