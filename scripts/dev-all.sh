#!/usr/bin/env bash
# Start all development services with fixed ports.
# Usage: pnpm dev:all
#
# Note: OAuth is handled by the session server (apps/session-server/)
# which runs via wrangler dev and handles both WebRTC signaling and OAuth.
#
# For isolated development with Docker, use: pnpm dev:isolated

set -e

# Fixed ports (matches env.ts defaults)
SERVER_PORT=4445
SESSION_PORT=4444
VITE_PORT=5173

# Build dependencies first (must exist before runtime)
pnpm --filter=@shipyard/loro-schema build
pnpm --filter=@shipyard/server build

# Run all services with concurrently
exec pnpm exec concurrently \
  --kill-others-on-fail \
  --names "server,session,web" \
  --prefix-colors "green,cyan,magenta" \
  "PORT=${SERVER_PORT} pnpm --filter @shipyard/server dev" \
  "pnpm --filter @shipyard/session-server exec wrangler dev --env development --port ${SESSION_PORT} --inspector-port 9229" \
  "VITE_PORT=${VITE_PORT} VITE_WS_PORT=${SERVER_PORT} VITE_GITHUB_OAUTH_WORKER=http://localhost:${SESSION_PORT} pnpm dev:web"
