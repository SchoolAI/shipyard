#!/usr/bin/env bash
#
# Generate unique environment variables for a worktree to avoid port collisions.
#
# Usage:
#   source scripts/worktree-env.sh <worktree-name>
#   # or
#   eval "$(scripts/worktree-env.sh myfeature)"
#
# This generates unique ports based on a hash of the worktree name,
# ensuring consistent ports across sessions while avoiding collisions.

set -e

WORKTREE_NAME="${1:-default}"

# Default worktree gets standard ports (slot 0)
# Recognized as: default, main, master, shipyard (the repo name)
if [ "$WORKTREE_NAME" = "default" ] || \
   [ "$WORKTREE_NAME" = "main" ] || \
   [ "$WORKTREE_NAME" = "master" ] || \
   [ "$WORKTREE_NAME" = "shipyard" ]; then
  SLOT=0
else
  # Generate a consistent hash from the worktree name (1-8 for 8 possible non-default slots)
  HASH=$(echo -n "$WORKTREE_NAME" | md5 | cut -c1-4)
  SLOT=$(( (16#$HASH % 8) + 1 ))
fi

# Calculate unique ports based on slot
REGISTRY_PORT=$((32191 + SLOT))
SIGNALING_PORT=$((4444 + SLOT * 10))
OAUTH_PORT=$((4445 + SLOT * 10))
OG_PROXY_PORT=$((4446 + SLOT * 10))
VITE_PORT=$((5173 + SLOT))
INSPECTOR_PORT_1=$((9229 + SLOT * 2))
INSPECTOR_PORT_2=$((9230 + SLOT * 2))

# State directory - default for main/shipyard, unique for feature worktrees
if [ "$SLOT" = "0" ]; then
  STATE_DIR="$HOME/.shipyard"
else
  STATE_DIR="$HOME/.shipyard-wt-${WORKTREE_NAME}"
fi

# Output environment variables
cat << EOF
# Shipyard worktree environment for: ${WORKTREE_NAME}
# Slot: ${SLOT} (based on hash of worktree name)

# Core identifiers
export SHIPYARD_WORKTREE_NAME="${WORKTREE_NAME}"
export SHIPYARD_STATE_DIR="${STATE_DIR}"

# Server ports
export REGISTRY_PORT="${REGISTRY_PORT}"
export PORT="${SIGNALING_PORT}"
export VITE_PORT="${VITE_PORT}"

# Wrangler worker ports (used by dev-all.sh)
export OAUTH_PORT="${OAUTH_PORT}"
export OG_PROXY_PORT="${OG_PROXY_PORT}"
export INSPECTOR_PORT_1="${INSPECTOR_PORT_1}"
export INSPECTOR_PORT_2="${INSPECTOR_PORT_2}"

# Node.js service URLs (MCP server, hook)
export SIGNALING_URL="ws://localhost:${SIGNALING_PORT}"
export SHIPYARD_WEB_URL="http://localhost:${VITE_PORT}"

# Vite browser-side environment variables
# These get compiled into the browser bundle at build time
export VITE_WEBRTC_SIGNALING="ws://localhost:${SIGNALING_PORT}"
export VITE_GITHUB_OAUTH_WORKER="http://localhost:${OAUTH_PORT}"
export VITE_OG_PROXY_URL="http://localhost:${OG_PROXY_PORT}"
export VITE_REGISTRY_PORT="${REGISTRY_PORT}"

# Port assignments summary:
# - Registry/WebSocket: ${REGISTRY_PORT}
# - Signaling server: ${SIGNALING_PORT}
# - OAuth worker: ${OAUTH_PORT}
# - OG Proxy worker: ${OG_PROXY_PORT}
# - Vite dev server: ${VITE_PORT}
# - Inspector ports: ${INSPECTOR_PORT_1}, ${INSPECTOR_PORT_2}
# - State directory: ${STATE_DIR}
EOF
