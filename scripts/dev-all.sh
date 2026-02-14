#!/usr/bin/env bash
# Start all development services.
# Usage: pnpm dev:all

set -e

SESSION_PORT=4444

# Load daemon env for the dev agent
set -a
source apps/daemon/.env.development
set +a

# Build dependencies first
pnpm --filter=@shipyard/loro-schema build
pnpm --filter=@shipyard/session build

# Run session server + web app + dev agent
exec pnpm exec concurrently \
  --kill-others-on-fail \
  --names "session,web,agent" \
  --prefix-colors "cyan,green,magenta" \
  "pnpm --filter @shipyard/session-server exec wrangler dev --env development --port ${SESSION_PORT} --inspector-port 9229" \
  "pnpm --filter @shipyard/web exec vite" \
  "sleep 3 && pnpm exec tsx scripts/dev-agent.ts"
