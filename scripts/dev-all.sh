#!/usr/bin/env bash
# Smart dev:all that auto-configures worktree environment
# Usage: pnpm dev:all (this script is called automatically)
#
# This script ensures all services use unique ports per worktree to avoid
# collisions when running multiple worktrees simultaneously.
#
# Note: OAuth is now handled by the signaling server (apps/signaling/)
# which runs via wrangler dev and handles both WebRTC signaling and OAuth.

set -e

# Auto-detect worktree name from directory or git branch
WORKTREE_NAME=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || basename "$(pwd)")

# Source environment for this worktree (gives main/default standard ports)
if [ -f scripts/worktree-env.sh ]; then
  eval "$(scripts/worktree-env.sh "$WORKTREE_NAME")"

  # Only show message if we're NOT using default ports
  if [ "$REGISTRY_PORT" != "32191" ]; then
    echo "Worktree: $WORKTREE_NAME"
    echo "   Registry: $REGISTRY_PORT | Vite: $VITE_PORT | Signaling: $PORT (incl. OAuth)"
    echo "   OG Proxy: $OG_PROXY_PORT"
  fi
fi

# Build dependencies, server, and daemon first (must exist before runtime)
pnpm --filter=@shipyard/schema build
pnpm --filter=@shipyard/hook build
pnpm --filter=@shipyard/server build
pnpm --filter=shipyard build

# Run all services with concurrently
# Note: Wrangler workers are called directly (not via turbo) to pass dynamic port flags
# All env vars from worktree-env.sh are passed explicitly since concurrently subprocess inheritance is unreliable
# OAuth is now handled by the signaling service (same port)
exec pnpm exec concurrently \
  --kill-others-on-fail \
  --names "schema,server,signal,ogproxy,web,hook,daemon" \
  --prefix-colors "gray,green,cyan,red,magenta,yellow,white" \
  "pnpm dev:schema" \
  "REGISTRY_PORT=${REGISTRY_PORT} SHIPYARD_WEB_URL=${SHIPYARD_WEB_URL} SIGNALING_URL=${SIGNALING_URL} DAEMON_PORT=${DAEMON_PORT} SHIPYARD_STATE_DIR=${SHIPYARD_STATE_DIR} pnpm --filter @shipyard/server dev" \
  "pnpm --filter @shipyard/signaling exec wrangler dev --env development --port ${PORT} --inspector-port ${INSPECTOR_PORT_1}" \
  "pnpm --filter @shipyard/og-proxy-worker exec wrangler dev --env development --port ${OG_PROXY_PORT} --inspector-port ${INSPECTOR_PORT_2} --var UPSTREAM_URL:http://localhost:${VITE_PORT} --var CANONICAL_BASE_URL:http://localhost:${OG_PROXY_PORT}" \
  "VITE_PORT=${VITE_PORT} VITE_WEBRTC_SIGNALING=${VITE_WEBRTC_SIGNALING} VITE_GITHUB_OAUTH_WORKER=${VITE_GITHUB_OAUTH_WORKER} VITE_OG_PROXY_URL=${VITE_OG_PROXY_URL} VITE_REGISTRY_PORT=${VITE_REGISTRY_PORT} VITE_DAEMON_WS_URL=${VITE_DAEMON_WS_URL} pnpm dev:web" \
  "SHIPYARD_WEB_URL=${SHIPYARD_WEB_URL} pnpm dev:hook" \
  "DAEMON_PORT=${DAEMON_PORT} SHIPYARD_STATE_DIR=${SHIPYARD_STATE_DIR} SHIPYARD_WEB_URL=${SHIPYARD_WEB_URL} pnpm --filter shipyard dev"
