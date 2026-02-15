#!/usr/bin/env bash
# Fix node-pty spawn-helper missing execute permission.
#
# The node-pty prebuilt binaries are shipped without +x on spawn-helper,
# causing "posix_spawnp failed" at runtime on macOS/Linux.
# This script is idempotent and safe to run on any platform.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

# Find all spawn-helper binaries in node-pty prebuilds
find "$ROOT_DIR/node_modules" -path "*/node-pty/prebuilds/*/spawn-helper" -type f 2>/dev/null | while read -r helper; do
  if [ ! -x "$helper" ]; then
    chmod +x "$helper"
    echo "Fixed execute permission: $helper"
  fi
done
