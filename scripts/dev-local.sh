#!/usr/bin/env bash
# Run shipyard session server locally.
# Usage: pnpm dev:local

set -e

SESSION_PORT=${PORT:-4444}
WRANGLER_STATE="${WRANGLER_STATE:-$HOME/.shipyard-dev/wrangler-state}"
mkdir -p "$WRANGLER_STATE"

echo "Building dependencies..."
pnpm --filter=@shipyard/loro-schema build

echo ""
echo "Starting session server on port ${SESSION_PORT}..."
pnpm --filter @shipyard/session-server exec wrangler dev --env development --port ${SESSION_PORT} --inspector-port 9229 --persist-to "$WRANGLER_STATE"
