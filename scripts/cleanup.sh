#!/usr/bin/env bash
set -euo pipefail

# Cleanup script for shipyard development servers
# Kills ALL shipyard dev processes comprehensively

echo "Cleaning up shipyard dev servers..."

# Function to force kill processes by pattern (uses SIGKILL directly for reliability)
kill_by_pattern() {
  local pattern="$1"
  local description="$2"

  # Find PIDs matching the pattern
  pids=$(pgrep -f "$pattern" 2>/dev/null || true)

  if [ -n "$pids" ]; then
    echo "  Killing $description..."
    # Use SIGKILL directly for reliable termination
    echo "$pids" | xargs kill -9 2>/dev/null || true
  fi
}

# Function to force kill processes by port
kill_by_port() {
  local port="$1"
  local description="$2"

  # Find PIDs using the port
  pids=$(lsof -ti ":$port" 2>/dev/null || true)

  if [ -n "$pids" ]; then
    echo "  Killing $description on port $port..."
    echo "$pids" | xargs kill -9 2>/dev/null || true
  fi
}

# Function to verify a port is free
verify_port_free() {
  local port="$1"
  if lsof -ti ":$port" >/dev/null 2>&1; then
    return 1
  fi
  return 0
}

# 1. Kill concurrently first (this will cascade to child processes)
kill_by_pattern "concurrently.*shipyard" "concurrently orchestrator"
kill_by_pattern "concurrently.*schema.*server.*signal" "concurrently (dev:all)"

# 2. Kill MCP server processes (all variations)
kill_by_pattern "node.*apps/server/dist/index.js" "MCP server (node dist/index.js)"
kill_by_pattern "node.*apps/server/dist/index.mjs" "MCP server (node dist/index.mjs)"
kill_by_pattern "tsx.*apps/server/src/server.ts" "MCP server (tsx)"
kill_by_pattern "tsx.*apps/server" "MCP server (tsx generic)"

# 3. Kill Wrangler dev workers (all variations)
kill_by_pattern "wrangler dev" "Wrangler dev (all workers)"
kill_by_pattern "wrangler.*og-proxy-worker" "Wrangler OG proxy worker"
kill_by_pattern "wrangler.*github-oauth-worker" "Wrangler OAuth worker"
kill_by_pattern "workerd" "Workerd runtime"

# 4. Kill Vite dev server
kill_by_pattern "vite.*apps/web" "Vite dev server (web)"
kill_by_pattern "node.*vite" "Vite via node"
kill_by_pattern "vite" "Vite (generic)"

# 5. Kill session server (now runs via wrangler, but keep tsx pattern for legacy)
kill_by_pattern "tsx.*apps/session-server" "Session server (tsx - legacy)"
kill_by_pattern "node.*apps/session-server" "Session server (node)"
kill_by_pattern "wrangler.*@shipyard/session-server" "Session server (wrangler)"

# 6. Kill turbo and build watchers
kill_by_pattern "turbo.*run.*dev" "Turbo dev"
kill_by_pattern "tsup.*--watch" "tsup watch"
kill_by_pattern "tsdown.*--watch" "tsdown watch"

# 7. Kill by specific dev ports (comprehensive port cleanup)
echo "  Cleaning up ports..."
for port in 5173 4444 4446 8787 8788 32191 32192; do
  kill_by_port "$port" "process"
done

# 8. Brief pause to allow processes to terminate
sleep 0.5

# 9. Verify all ports are free
echo ""
echo "Verifying ports are free..."
all_ports_free=true
for port in 5173 4444 4446 8787 8788 32191 32192; do
  if ! verify_port_free "$port"; then
    echo "  WARNING: Port $port is still in use!"
    all_ports_free=false
  fi
done

if [ "$all_ports_free" = true ]; then
  echo "  All ports are free"
fi

echo ""
echo "Removing build artifacts..."

shipyard_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Clean build artifacts
rm -rf "$shipyard_dir/apps/*/dist"
rm -rf "$shipyard_dir/packages/*/dist"
rm -rf "$shipyard_dir/.turbo"
rm -rf "$shipyard_dir/node_modules/.vite"

# Clean test artifacts
rm -rf "$shipyard_dir/test-results"
rm -rf "$shipyard_dir/.playwright"

echo ""
echo "Cleanup complete!"
echo ""
echo "Tip: Run 'pnpm dev:all' to start all services again"
