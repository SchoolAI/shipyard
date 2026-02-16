#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== Shipyard Setup ==="
echo ""

# Step 1: Secrets
bash "$SCRIPT_DIR/setup-secrets.sh"
echo ""

# Step 2: Database migrations
bash "$SCRIPT_DIR/db-migrate.sh"
echo ""

# Step 3: Build + Login
bash "$SCRIPT_DIR/setup-login.sh"

echo ""
echo "=== Setup Complete ==="
echo ""
echo "You're ready! Run:"
echo "  pnpm dev:session-server"
echo "  shipyard-daemon --serve  (in another terminal)"
echo ""
