#!/usr/bin/env bash
# Fix native module issues after pnpm install.
#
# 1. node-pty: prebuilt binaries ship without +x on spawn-helper,
#    causing "posix_spawnp failed" at runtime on macOS/Linux.
# 2. node-datachannel: prebuild-install may not run in worktrees or
#    when pnpm's content-addressable store skips the install script.
#    We detect the missing .node binary and run prebuild-install.
#
# This script is idempotent and safe to run on any platform.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

# --- node-pty: fix spawn-helper permissions ---
find "$ROOT_DIR/node_modules" -path "*/node-pty/prebuilds/*/spawn-helper" -type f 2>/dev/null | while read -r helper; do
  if [ ! -x "$helper" ]; then
    chmod +x "$helper"
    echo "Fixed execute permission: $helper"
  fi
done

# --- node-datachannel: ensure native addon is built ---
# Find the node-datachannel package directory (handles any version)
NDC_DIR=$(find "$ROOT_DIR/node_modules/.pnpm" -maxdepth 1 -type d -name "node-datachannel@*" 2>/dev/null | head -1)
if [ -n "$NDC_DIR" ]; then
  NDC_PKG="$NDC_DIR/node_modules/node-datachannel"
  if [ -d "$NDC_PKG" ] && [ ! -f "$NDC_PKG/build/Release/node_datachannel.node" ]; then
    echo "node-datachannel native addon missing, running prebuild-install..."
    (cd "$NDC_PKG" && npx prebuild-install -r napi 2>&1) || {
      echo "WARNING: prebuild-install failed for node-datachannel. WebRTC features may not work."
      echo "Try: cd $NDC_PKG && npm run install"
    }
    if [ -f "$NDC_PKG/build/Release/node_datachannel.node" ]; then
      echo "node-datachannel native addon installed successfully."
    fi
  fi
fi
