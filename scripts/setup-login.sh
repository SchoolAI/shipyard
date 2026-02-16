#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$ROOT_DIR"

# Step 1: Build daemon
echo "Building daemon..."
pnpm -F @shipyard/daemon build --silent 2>/dev/null || pnpm -F @shipyard/daemon build

# Step 2: Start session server in background
echo "Starting session server..."
pnpm dev:session-server &
SERVER_PID=$!

# Cleanup on exit (ctrl+c, error, etc.)
cleanup() {
  if kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

# Step 3: Wait for server to be healthy
echo "Waiting for session server..."
MAX_WAIT=30
for i in $(seq 1 $MAX_WAIT); do
  if curl -sf http://localhost:4444/health > /dev/null 2>&1; then
    echo "✓ Session server is ready"
    break
  fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "✗ Session server failed to start"
    exit 1
  fi
  sleep 1
done

if ! curl -sf http://localhost:4444/health > /dev/null 2>&1; then
  echo "✗ Session server did not become healthy in ${MAX_WAIT}s"
  exit 1
fi

# Step 4: Run login
echo ""
node apps/daemon/dist/index.js login

echo ""
echo "✓ Login complete. Stopping session server..."
