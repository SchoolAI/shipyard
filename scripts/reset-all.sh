#!/usr/bin/env bash
set -euo pipefail

# Nuclear reset script for peer-plan development
# Clears ALL storage: server LevelDB, browser IndexedDB, localStorage
#
# Usage: pnpm reset
#
# IMPORTANT: Disable MCP servers first in Claude Code:
#   Run: /mcp disable
#   Then: pnpm reset
#   This prevents Claude Code from auto-restarting the hub during reset.
#
# This script:
# 1. Kills all peer-plan dev processes (MCP servers, registry, signaling)
# 2. Clears server-side LevelDB storage (~/.peer-plan/plans/)
# 3. Opens browser to trigger client-side reset (?reset=all)

echo "🧨 Nuclear Reset: Clearing ALL peer-plan data..."
echo ""
echo "⚠️  If running via Claude Code, please run /mcp disable first!"
echo "   (This prevents the hub from auto-restarting)"
echo ""

# --- Step 0: Preparation ---
echo "⚠️  PREPARATION: Close all peer-plan browser tabs!"
echo ""
echo "   This includes:"
echo "   • Regular browser tabs on localhost:5173"
echo "   • Incognito/private windows (separate storage)"
echo "   • Any tabs showing peer-plan plans"
echo ""
echo "   Open tabs will BLOCK IndexedDB deletion."
echo ""
echo "   NOTE: If remote P2P peers are connected, they will re-sync"
echo "   data back when you reconnect. This reset is for LOCAL dev only."
echo ""

# Countdown
for i in 5 4 3 2 1; do
  echo -ne "   Starting in $i...\r"
  sleep 1
done
echo "   Starting now!        "
echo ""

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# --- Step 1: Kill all peer-plan processes ---
echo "🔪 Step 1: Killing all peer-plan processes..."

# Get all PIDs for peer-plan directory (excludes worktrees and VS Code)
# Matches: Working Directory/peer-plan/
# Excludes: peer-plan-wt/, biome lsp-proxy, tmux sessions
echo "  Finding peer-plan processes..."
pids=$(ps aux | \
  grep "Working Directory/peer-plan/" | \
  grep -v "peer-plan-wt" | \
  grep -v "biome lsp-proxy" | \
  grep -v "biome __run_server" | \
  grep -v "tmux" | \
  grep -v grep | \
  awk '{print $2}' || true)

if [ -n "$pids" ]; then
  pid_count=$(echo "$pids" | wc -l | tr -d ' ')
  echo "  Found $pid_count processes to kill"

  # First try graceful shutdown
  echo "$pids" | xargs kill 2>/dev/null || true
  sleep 1

  # Force kill any remaining (check if still alive)
  still_alive=$(ps -p $(echo "$pids" | tr '\n' ',' | sed 's/,$//') 2>/dev/null | grep -v PID | awk '{print $1}' || true)
  if [ -n "$still_alive" ]; then
    echo "  Force killing stubborn processes..."
    echo "$still_alive" | xargs kill -9 2>/dev/null || true
  fi

  echo "  ✓ Processes killed"
else
  echo "  ✓ No processes to kill"
fi

# --- Step 2: Clear server-side storage ---
echo ""
echo "🗄️  Step 2: Clearing server-side storage..."

PEER_PLAN_DIR="$HOME/.peer-plan"

if [ -d "$PEER_PLAN_DIR/plans" ]; then
  # Count what we're deleting
  plan_count=$(find "$PEER_PLAN_DIR/plans" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l | tr -d ' ')
  rm -rf "$PEER_PLAN_DIR/plans"
  echo "  ✓ Cleared $plan_count session(s) from ~/.peer-plan/plans/"
else
  echo "  ✓ No server storage to clear"
fi

# Clear hook state (Claude Code session metadata)
HOOK_STATE_FILE="$PEER_PLAN_DIR/hook-state.json"
if [ -f "$HOOK_STATE_FILE" ]; then
  rm -f "$HOOK_STATE_FILE"
  echo "  ✓ Cleared hook state (session metadata)"
fi

# Clear Playwright's IndexedDB cache (survives browser restarts)
PLAYWRIGHT_CACHE="$HOME/Library/Caches/ms-playwright"
if [ -d "$PLAYWRIGHT_CACHE" ]; then
  playwright_dbs=$(find "$PLAYWRIGHT_CACHE" -name "http_localhost_5173.indexeddb.leveldb" 2>/dev/null)
  if [ -n "$playwright_dbs" ]; then
    echo "$playwright_dbs" | while read -r db_path; do
      rm -rf "$db_path"
    done
    echo "  ✓ Cleared Playwright IndexedDB cache"
  fi
fi

# Clear Chrome's IndexedDB cache (if using Chrome instead of Playwright)
CHROME_INDEXEDDB="$HOME/Library/Application Support/Google/Chrome/Default/IndexedDB"
if [ -d "$CHROME_INDEXEDDB/http_localhost_5173.indexeddb.leveldb" ]; then
  rm -rf "$CHROME_INDEXEDDB/http_localhost_5173.indexeddb.leveldb"
  echo "  ✓ Cleared Chrome IndexedDB cache"
fi

# --- Step 3: Open browser for client-side reset ---
echo ""
echo "🌐 Step 3: Clearing browser storage..."

# Check if Vite dev server is actually responding (not just stale connections)
VITE_PORT=${PORT:-5173}
VITE_RUNNING=false

if curl -s --max-time 2 "http://localhost:$VITE_PORT" >/dev/null 2>&1; then
  VITE_RUNNING=true
  echo "  Vite is already running on port $VITE_PORT"
fi

if [ "$VITE_RUNNING" = true ]; then
  # Vite is running, just open the reset URL
  RESET_URL="http://localhost:$VITE_PORT/?reset=all"
  echo "  Opening browser: $RESET_URL"

  # Open browser (macOS)
  if command -v open &>/dev/null; then
    open "$RESET_URL"
  # Linux
  elif command -v xdg-open &>/dev/null; then
    xdg-open "$RESET_URL"
  # WSL
  elif command -v wslview &>/dev/null; then
    wslview "$RESET_URL"
  else
    echo "  ⚠️  Could not open browser. Please open: $RESET_URL"
  fi

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "✅ Server storage cleared!"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  echo "A browser tab should open to clear browser storage."
  echo "Once complete, it will redirect to the home page."
  echo ""
  echo "If the browser didn't open, manually visit:"
  echo "  $RESET_URL"
  echo ""
  echo "📝 Note: To reset GitHub Pages (production), use DevTools:"
  echo "   Application → Storage → Clear site data"
else
  # Vite is not running - start it temporarily for reset
  echo "  Vite not running. Starting temporarily for reset..."

  # Start Vite in background with output to temp file for debugging
  cd "$PROJECT_DIR"
  VITE_LOG=$(mktemp)
  pnpm dev:web -- --port "$VITE_PORT" --no-open > "$VITE_LOG" 2>&1 &
  VITE_PID=$!

  # Wait for Vite to start (up to 30 seconds)
  echo "  Waiting for Vite to start..."
  VITE_STARTED=false
  for i in {1..60}; do
    if curl -s --max-time 1 "http://localhost:$VITE_PORT" >/dev/null 2>&1; then
      VITE_STARTED=true
      break
    fi
    # Show progress every 5 iterations
    if [ $((i % 10)) -eq 0 ]; then
      echo "    Still waiting... ($((i / 2))s)"
    fi
    sleep 0.5
  done

  if [ "$VITE_STARTED" = false ]; then
    echo "  ⚠️  Vite failed to start. Log output:"
    cat "$VITE_LOG"
    rm -f "$VITE_LOG"
    exit 1
  fi
  rm -f "$VITE_LOG"
  echo "  ✓ Vite started"

  RESET_URL="http://localhost:$VITE_PORT/?reset=all"
  echo "  Opening browser: $RESET_URL"

  # Open browser
  if command -v open &>/dev/null; then
    open "$RESET_URL"
  elif command -v xdg-open &>/dev/null; then
    xdg-open "$RESET_URL"
  elif command -v wslview &>/dev/null; then
    wslview "$RESET_URL"
  else
    echo "  ⚠️  Could not open browser. Please open: $RESET_URL"
  fi

  # Wait for user to complete reset
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "✅ Server storage cleared!"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  echo "Browser opened for client-side reset."
  echo "Press Enter after the browser shows 'Reset Complete'..."
  read -r

  # Stop Vite - kill all processes including child processes
  echo "Stopping Vite..."

  # Kill the process group (including all children)
  if ps -p $VITE_PID > /dev/null 2>&1; then
    # Get the process group ID
    pgid=$(ps -o pgid= -p $VITE_PID | tr -d ' ')
    if [ -n "$pgid" ]; then
      # Kill entire process group
      kill -TERM -$pgid 2>/dev/null || true
      sleep 1
      # Force kill if still running
      kill -9 -$pgid 2>/dev/null || true
    fi
  fi

  # Double-check: kill any remaining Vite processes on this port
  vite_pids=$(lsof -ti :$VITE_PORT 2>/dev/null || true)
  if [ -n "$vite_pids" ]; then
    echo "$vite_pids" | xargs kill -9 2>/dev/null || true
  fi

  echo ""
  echo "🎉 Reset complete! Local peer-plan data has been cleared."
  echo ""
  echo "📝 Note: To reset GitHub Pages (production), use DevTools:"
  echo "   Application → Storage → Clear site data"
fi
