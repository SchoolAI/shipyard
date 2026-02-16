#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SESSION_SERVER_DIR="$SCRIPT_DIR/../apps/session-server"

echo "Applying D1 migrations locally..."
cd "$SESSION_SERVER_DIR"

if command -v wrangler &> /dev/null; then
  wrangler d1 migrations apply shipyard-users --local 2>/dev/null || {
    echo "  Note: migrations may already be applied, or wrangler dev will apply them."
  }
else
  npx wrangler d1 migrations apply shipyard-users --local 2>/dev/null || {
    echo "  Note: migrations may already be applied, or wrangler dev will apply them."
  }
fi

echo "✓ D1 migrations applied"
