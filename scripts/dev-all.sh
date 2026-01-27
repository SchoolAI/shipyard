#!/usr/bin/env bash
# Smart dev:all that auto-configures worktree environment
# Usage: pnpm dev:all (this script is called automatically)

set -e

# Auto-detect worktree name from directory or git branch
WORKTREE_NAME=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || basename "$(pwd)")

# Source environment for this worktree (gives main/default standard ports)
if [ -f scripts/worktree-env.sh ]; then
  eval "$(scripts/worktree-env.sh "$WORKTREE_NAME")"

  # Only show message if we're NOT using default ports
  if [ "$REGISTRY_PORT" != "32191" ]; then
    echo "🔧 Worktree: $WORKTREE_NAME | Registry: $REGISTRY_PORT | Vite: $VITE_PORT"
  fi
fi

# Build dependencies first
pnpm --filter=@shipyard/schema build
pnpm --filter=@shipyard/hook build

# Run all services with concurrently
exec pnpm exec concurrently \
  --kill-others-on-fail \
  --names "schema,server,signal,oauth,ogproxy,web,hook" \
  --prefix-colors "gray,green,cyan,blue,red,magenta,yellow" \
  "pnpm dev:schema" \
  "pnpm dev:server:watch" \
  "pnpm dev:signaling" \
  "pnpm dev:github-oauth" \
  "pnpm dev:og-proxy" \
  "pnpm dev:web" \
  "pnpm dev:hook"
