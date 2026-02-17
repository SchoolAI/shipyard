#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$ROOT_DIR"

# Step 1: Build daemon and its dependencies (not the web app)
echo "Building daemon and dependencies..."
TURBO_NO_UPDATE_NOTIFIER=1 pnpm -F @shipyard/loro-schema -F @shipyard/session -F @shipyard/daemon build > /dev/null 2>&1

if [ ! -f "$ROOT_DIR/apps/daemon/dist/index.js" ]; then
  echo "✗ Daemon build failed"
  exit 1
fi
echo "✓ Daemon built"

# Step 2: Preflight — check secrets before starting server
DEV_VARS="$ROOT_DIR/apps/session-server/.dev.vars"
if [ -f "$DEV_VARS" ] && ! grep -q "^GITHUB_CLIENT_SECRET=.\+" "$DEV_VARS"; then
  echo "✗ GITHUB_CLIENT_SECRET is empty in $DEV_VARS"
  echo "  Ask a team member or check 1Password for the shared dev secret."
  exit 1
fi

# Step 3: Kill any existing process on port 4444 (may be from another worktree)
EXISTING_PID=$(lsof -ti :4444 2>/dev/null || true)
if [ -n "$EXISTING_PID" ]; then
  echo "WARNING: Killing existing process on port 4444 (PID $EXISTING_PID) -- may be from another worktree"
  kill $EXISTING_PID 2>/dev/null || true
  # Wait briefly for the port to be released
  sleep 1
  # Force-kill if still alive
  STILL_ALIVE=$(lsof -ti :4444 2>/dev/null || true)
  if [ -n "$STILL_ALIVE" ]; then
    kill -9 $STILL_ALIVE 2>/dev/null || true
    sleep 1
  fi
fi

# Step 4: Always start a fresh server from the current worktree
echo "Starting session server from current worktree..."
pnpm dev:session-server > /dev/null 2>&1 &
SERVER_PID=$!

cleanup() {
  if kill -0 "$SERVER_PID" 2>/dev/null; then
    pkill -P "$SERVER_PID" 2>/dev/null
    kill "$SERVER_PID" 2>/dev/null
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

# Wait for server to be healthy
echo -n "Waiting for session server"
MAX_WAIT=30
for i in $(seq 1 "$MAX_WAIT"); do
  if curl -sf http://localhost:4444/health > /dev/null 2>&1; then
    echo ""
    echo "Session server is ready"
    break
  fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo ""
    echo "Session server failed to start (check if port 4444 is in use)"
    exit 1
  fi
  echo -n "."
  sleep 1
done

if ! curl -sf http://localhost:4444/health > /dev/null 2>&1; then
  echo ""
  echo "Session server did not become healthy in ${MAX_WAIT}s"
  exit 1
fi

# Step 5: Run login (point at local server)
echo ""
SHIPYARD_DEV=1 SHIPYARD_SIGNALING_URL=http://localhost:4444 node apps/daemon/dist/index.js login

echo ""
echo "Login complete. Stopping session server..."
