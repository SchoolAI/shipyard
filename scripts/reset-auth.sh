#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SESSION_SERVER_DIR="$ROOT_DIR/apps/session-server"
SHIPYARD_DEV_DIR="$HOME/.shipyard-dev"
WRANGLER_STATE="${WRANGLER_STATE:-$HOME/.shipyard-dev/wrangler-state}"

echo "=== Shipyard Auth Reset ==="
echo ""
echo "This wipes ALL auth state so browser + daemon get the same user ID."
echo ""
echo "Will delete:"
echo "  1. Shared wrangler state (~/.shipyard-dev/wrangler-state/)"
echo "     + legacy per-worktree (session-server/.wrangler/state/)"
echo "  2. Daemon config         (~/.shipyard-dev/config.json)"
echo "  3. Daemon data           (~/.shipyard-dev/data/)"
echo "  4. Daemon PID file       (~/.shipyard-dev/daemon.pid)"
echo ""

read -rp "Continue? [y/N] " confirm
if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
  echo "Aborted."
  exit 0
fi

echo ""

# Step 1: Kill any running daemon
DAEMON_PID_FILE="$SHIPYARD_DEV_DIR/daemon.pid"
if [ -f "$DAEMON_PID_FILE" ]; then
  DAEMON_PID=$(cat "$DAEMON_PID_FILE" 2>/dev/null || true)
  if [ -n "$DAEMON_PID" ] && kill -0 "$DAEMON_PID" 2>/dev/null; then
    echo "Stopping running daemon (PID $DAEMON_PID)..."
    kill "$DAEMON_PID" 2>/dev/null || true
    sleep 1
  fi
fi

# Kill anything on port 4444 (session server)
EXISTING_PID=$(lsof -ti :4444 2>/dev/null || true)
if [ -n "$EXISTING_PID" ]; then
  echo "Stopping session server on port 4444 (PID $EXISTING_PID)..."
  kill "$EXISTING_PID" 2>/dev/null || true
  sleep 1
  STILL_ALIVE=$(lsof -ti :4444 2>/dev/null || true)
  if [ -n "$STILL_ALIVE" ]; then
    kill -9 "$STILL_ALIVE" 2>/dev/null || true
    sleep 1
  fi
fi

# Step 2: Wipe wrangler local state (D1 + Durable Objects)
WIPED_WRANGLER=0
if [ -d "$WRANGLER_STATE" ]; then
  rm -rf "$WRANGLER_STATE"
  echo "✓ Wiped shared wrangler state ($WRANGLER_STATE)"
  WIPED_WRANGLER=1
fi
if [ -d "$SESSION_SERVER_DIR/.wrangler/state" ]; then
  rm -rf "$SESSION_SERVER_DIR/.wrangler/state"
  echo "✓ Wiped legacy per-worktree wrangler state"
  WIPED_WRANGLER=1
fi
if [ "$WIPED_WRANGLER" -eq 0 ]; then
  echo "  (no wrangler state to delete)"
fi

# Step 3: Wipe daemon config + data
if [ -f "$SHIPYARD_DEV_DIR/config.json" ]; then
  rm -f "$SHIPYARD_DEV_DIR/config.json"
  echo "✓ Deleted daemon config (~/.shipyard-dev/config.json)"
else
  echo "  (no daemon config to delete)"
fi

if [ -d "$SHIPYARD_DEV_DIR/data" ]; then
  rm -rf "$SHIPYARD_DEV_DIR/data"
  echo "✓ Deleted daemon data (~/.shipyard-dev/data/)"
else
  echo "  (no daemon data to delete)"
fi

if [ -f "$DAEMON_PID_FILE" ]; then
  rm -f "$DAEMON_PID_FILE"
  echo "✓ Deleted daemon PID file"
fi

# Step 4: Rotate JWT_SECRET so old browser tokens auto-invalidate
DEV_VARS="$SESSION_SERVER_DIR/.dev.vars"
if [ -f "$DEV_VARS" ]; then
  NEW_SECRET=$(openssl rand -base64 32)
  node -e "
    const fs = require('fs');
    const path = process.argv[1];
    let content = fs.readFileSync(path, 'utf8');
    content = content.replace(/^JWT_SECRET=.*$/m, 'JWT_SECRET=' + process.argv[2]);
    fs.writeFileSync(path, content);
  " "$DEV_VARS" "$NEW_SECRET"
  echo "✓ Rotated JWT_SECRET in .dev.vars"
else
  echo "  (no .dev.vars found — skipping JWT_SECRET rotation)"
fi

# Step 5: Re-apply D1 migrations
echo ""
echo "Applying D1 migrations..."
bash "$SCRIPT_DIR/db-migrate.sh"

# Step 6: Build + login daemon (starts temp server, runs device flow)
echo ""
echo "Running daemon login..."
bash "$SCRIPT_DIR/setup-login.sh"

# Step 7: Done
echo ""
echo "=== Done ==="
echo ""
echo "The daemon is logged in with a fresh user ID and the JWT secret was rotated."
echo ""
echo "Next: start the dev servers and re-login in the browser."
echo "  1. Run 'pnpm dev:all'"
echo "  2. Open http://localhost:5173 — you'll be redirected to login automatically"
echo "  3. Sign in with GitHub"
echo ""
echo "Both browser and daemon will share the same user ID."
