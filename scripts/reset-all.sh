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

# Function to safely kill processes by pattern
kill_by_pattern() {
  local pattern="$1"
  local description="$2"
  pids=$(pgrep -f "$pattern" 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo "  Killing $description..."
    echo "$pids" | xargs kill 2>/dev/null || true
    sleep 0.5
    # Force kill any remaining
    remaining=$(pgrep -f "$pattern" 2>/dev/null || true)
    if [ -n "$remaining" ]; then
      echo "$remaining" | xargs kill -9 2>/dev/null || true
    fi
  fi
}

# Kill MCP servers
kill_by_pattern "node.*server.*index.mjs" "MCP servers"
kill_by_pattern "tsx.*apps/server" "MCP dev servers"

# Kill registry server
kill_by_pattern "registry-server" "registry server"
kill_by_pattern "tsx.*registry" "registry server (tsx)"

# Kill signaling server
kill_by_pattern "tsx.*signaling" "signaling server"

# Kill vite if running
kill_by_pattern "vite.*apps/web" "Vite dev server"

# Give processes time to exit
sleep 1
echo "  ✓ Processes killed"

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

  # Stop Vite
  echo "Stopping Vite..."
  kill $VITE_PID 2>/dev/null || true

  echo ""
  echo "🎉 Reset complete! Local peer-plan data has been cleared."
  echo ""
  echo "📝 Note: To reset GitHub Pages (production), use DevTools:"
  echo "   Application → Storage → Clear site data"
fi
