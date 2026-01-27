#!/usr/bin/env bash
set -euo pipefail

# Nuclear reset script for shipyard development
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
# 1. Kills all shipyard dev processes (MCP servers, registry, signaling)
# 2. Clears server-side LevelDB storage (~/.shipyard/plans/)
# 3. Opens browser to trigger client-side reset (?reset=all)

echo "🧨 Nuclear Reset: Clearing ALL shipyard data..."
echo ""
echo "⚠️  If running via Claude Code, please run /mcp disable first!"
echo "   (This prevents the hub from auto-restarting)"
echo ""

# --- Step 0: Preparation ---
echo "⚠️  PREPARATION: Close all shipyard browser tabs!"
echo ""
echo "   This includes:"
echo "   • Regular browser tabs on localhost:5173"
echo "   • Incognito/private windows (separate storage)"
echo "   • Any tabs showing shipyard plans"
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

# --- Step 1: Kill all shipyard processes ---
echo "🔪 Step 1: Killing all shipyard processes..."

# Get all PIDs for shipyard directory (excludes worktrees and VS Code)
# Matches: Working Directory/shipyard/
# Excludes: shipyard-wt/, biome lsp-proxy, tmux sessions
echo "  Finding shipyard processes..."
pids=$(ps aux | \
  grep -E "Working Directory/shipyard/" | \
  grep -v "shipyard-wt" | \
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

# Auto-detect worktree name to get correct state directory
WORKTREE_NAME=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || basename "$(pwd)")
if [ -f "$SCRIPT_DIR/worktree-env.sh" ]; then
  eval "$("$SCRIPT_DIR/worktree-env.sh" "$WORKTREE_NAME" | grep SHIPYARD_STATE_DIR)"
  SHIPYARD_DIR="$SHIPYARD_STATE_DIR"
else
  SHIPYARD_DIR="$HOME/.shipyard"
fi

if [ -d "$SHIPYARD_DIR/plans" ]; then
  # Count what we're deleting
  plan_count=$(find "$SHIPYARD_DIR/plans" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l | tr -d ' ')
  rm -rf "$SHIPYARD_DIR/plans"
  echo "  ✓ Cleared $plan_count session(s) from ~/.shipyard/plans/"
else
  echo "  ✓ No server storage to clear"
fi

# Clear hook state (Claude Code session metadata)
HOOK_STATE_FILE="$SHIPYARD_DIR/hook-state.json"
if [ -f "$HOOK_STATE_FILE" ]; then
  rm -f "$HOOK_STATE_FILE"
  echo "  ✓ Cleared hook state (session metadata)"
fi

# Clear hub.lock (contains stale PID from killed MCP server)
HUB_LOCK_FILE="$SHIPYARD_DIR/hub.lock"
if [ -f "$HUB_LOCK_FILE" ]; then
  rm -f "$HUB_LOCK_FILE"
  echo "  ✓ Cleared hub.lock (stale process lock)"
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

# Clear Chrome's IndexedDB cache for ALL profiles (Default, Profile 1, Profile 2, etc.)
CHROME_DIR="$HOME/Library/Application Support/Google/Chrome"
if [ -d "$CHROME_DIR" ]; then
  cleared_count=0

  # Find all Chrome profiles (Default, Profile 1, Profile 2, etc.)
  for profile_dir in "$CHROME_DIR"/Default "$CHROME_DIR"/Profile*; do
    [ -d "$profile_dir" ] || continue
    profile_name=$(basename "$profile_dir")

    # Clear both .leveldb (structure) and .blob (binary data) directories
    for db_type in leveldb blob; do
      db_path="$profile_dir/IndexedDB/http_localhost_5173.indexeddb.$db_type"
      if [ -d "$db_path" ]; then
        size=$(du -sh "$db_path" 2>/dev/null | cut -f1)
        rm -rf "$db_path"
        echo "  ✓ Cleared Chrome $profile_name IndexedDB ($db_type, $size)"
        cleared_count=$((cleared_count + 1))
      fi
    done
  done

  if [ $cleared_count -eq 0 ]; then
    echo "  ✓ No Chrome IndexedDB to clear"
  fi
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
    pgid=$(ps -o pgid= -p $VITE_PID | tr -d ' ') || true
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

  echo "  ✓ Vite stopped"
  echo ""
  echo "🎉 Reset complete! Local shipyard data has been cleared."
  echo ""
  echo "📝 Note: To reset GitHub Pages (production), use DevTools:"
  echo "   Application → Storage → Clear site data"
fi

# Ensure script exits with success even if cleanup had issues
exit 0
