#!/usr/bin/env bash
set -euo pipefail

# Cleanup script for peer-plan development servers
# Kills only dev server processes, not editors or Claude sessions

echo "🧹 Cleaning up peer-plan dev servers..."

# Function to safely kill processes by pattern
kill_by_pattern() {
  local pattern="$1"
  local description="$2"

  # Find PIDs matching the pattern
  pids=$(pgrep -f "$pattern" 2>/dev/null || true)

  if [ -n "$pids" ]; then
    echo "  Killing $description..."
    # Try graceful shutdown first (SIGTERM)
    echo "$pids" | xargs kill 2>/dev/null || true

    # Wait a moment for graceful shutdown
    sleep 1

    # Force kill any remaining processes (SIGKILL)
    remaining=$(pgrep -f "$pattern" 2>/dev/null || true)
    if [ -n "$remaining" ]; then
      echo "  Force killing $description..."
      echo "$remaining" | xargs kill -9 2>/dev/null || true
    fi
  fi
}

# Function to kill processes by port
kill_by_port() {
  local port="$1"
  local description="$2"

  # Find PIDs using the port
  pids=$(lsof -ti ":$port" 2>/dev/null || true)

  if [ -n "$pids" ]; then
    echo "  Killing $description on port $port..."
    echo "$pids" | xargs kill 2>/dev/null || true
    sleep 1

    # Force kill if still running
    remaining=$(lsof -ti ":$port" 2>/dev/null || true)
    if [ -n "$remaining" ]; then
      echo "  Force killing $description on port $port..."
      echo "$remaining" | xargs kill -9 2>/dev/null || true
    fi
  fi
}

# 1. Kill concurrently first (this will cascade to child processes)
kill_by_pattern "concurrently.*peer-plan" "concurrently orchestrator"

# Give it a moment for cascade
sleep 1

# 2. Kill specific dev server processes if they survived
kill_by_pattern "tsx.*apps/server/src/server.ts" "MCP server (tsx)"
kill_by_pattern "node.*apps/server/dist/index.mjs" "MCP server (built)"
kill_by_pattern "tsx.*apps/signaling/src/server.ts" "Signaling server"
kill_by_pattern "vite.*apps/web" "Vite dev server"
kill_by_pattern "wrangler.*apps/github-oauth-worker.*dev" "Wrangler OAuth worker"
kill_by_pattern "tsdown.*--watch" "tsdown watch processes"

# 3. Kill by specific dev ports as backup
kill_by_port "5173" "Vite"
kill_by_port "4444" "Signaling"
kill_by_port "8787" "Wrangler"

echo "🗑️  Removing build artifacts..."

peer_plan_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Clean build artifacts
rm -rf "$peer_plan_dir/apps/*/dist"
rm -rf "$peer_plan_dir/packages/*/dist"
rm -rf "$peer_plan_dir/.turbo"
rm -rf "$peer_plan_dir/node_modules/.vite"

# Clean test artifacts
rm -rf "$peer_plan_dir/test-results"
rm -rf "$peer_plan_dir/.playwright"

echo "✅ Cleanup complete!"
echo ""
echo "Tip: Run 'pnpm dev:all' to start all services again"
