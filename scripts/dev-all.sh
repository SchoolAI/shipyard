#!/usr/bin/env bash
# Start all development services.
# Usage: pnpm dev:all

set -e

SESSION_PORT=4444

# Enable dev mode (separate config + data directories)
export SHIPYARD_DEV=1

WRANGLER_STATE="${WRANGLER_STATE:-$HOME/.shipyard-dev/wrangler-state}"
mkdir -p "$WRANGLER_STATE"

# Load daemon env for serve mode
set -a
source apps/daemon/.env
set +a

# Build dependencies first
pnpm --filter=@shipyard/loro-schema build
pnpm --filter=@shipyard/session build

# Run session server + web app + daemon in serve mode
exec pnpm exec concurrently \
  --kill-others-on-fail \
  --names "session,web,daemon" \
  --prefix-colors "cyan,green,magenta" \
  "pnpm --filter @shipyard/session-server exec wrangler dev --env development --port ${SESSION_PORT} --inspector-port 9229 --persist-to ${WRANGLER_STATE}" \
  "pnpm --filter @shipyard/web exec vite" \
  "sleep 3 && pnpm --filter @shipyard/daemon exec tsx src/index.ts --serve"
