#!/usr/bin/env bash
# Signaling server wrapper with worktree port detection

cd "$(dirname "$0")/.."

WORKTREE_NAME=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || basename "$(pwd)")

if [ -f scripts/worktree-env.sh ]; then
  eval "$(scripts/worktree-env.sh "$WORKTREE_NAME")"
fi

exec pnpm --filter=@shipyard/signaling exec tsx src/server.ts
