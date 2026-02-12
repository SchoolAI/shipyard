#!/usr/bin/env bash
# Start development services.
# Usage: pnpm dev:all

set -e

SESSION_PORT=4444

# Build dependencies first
pnpm --filter=@shipyard/loro-schema build

# Run session server
exec pnpm exec concurrently \
  --kill-others-on-fail \
  --names "session" \
  --prefix-colors "cyan" \
  "pnpm --filter @shipyard/session-server exec wrangler dev --env development --port ${SESSION_PORT} --inspector-port 9229"
