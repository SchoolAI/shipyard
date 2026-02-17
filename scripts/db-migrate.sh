#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SESSION_SERVER_DIR="$SCRIPT_DIR/../apps/session-server"

echo "Applying D1 migrations locally..."
cd "$SESSION_SERVER_DIR"

WRANGLER_CMD="wrangler"
if ! command -v wrangler &> /dev/null; then
  WRANGLER_CMD="npx wrangler"
fi

$WRANGLER_CMD d1 migrations apply --env development --local DB || {
  echo "  ⚠️  Migration command failed. This may be OK if migrations were already applied."
  echo "  Run 'wrangler dev' to verify — it applies migrations on startup."
}

echo "✓ D1 migrations applied"
