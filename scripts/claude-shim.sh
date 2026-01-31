#!/usr/bin/env bash
#
# Claude spawn shim for isolated Docker environments.
#
# Instead of actually spawning Claude Code, this script logs the spawn request
# to a file for inspection. This allows testing daemon functionality without
# requiring a real Claude installation inside the container.
#
# Usage: claude-shim.sh [args...]
# Environment:
#   CLAUDE_SHIM_LOG_DIR - Directory for log files (default: /var/log/shipyard)

set -e

LOG_DIR="${CLAUDE_SHIM_LOG_DIR:-/var/log/shipyard}"
TIMESTAMP=$(date +%Y%m%d-%H%M%S-%N)
LOG_FILE="${LOG_DIR}/claude-spawn-${TIMESTAMP}.log"

# Ensure log directory exists
mkdir -p "$LOG_DIR"

# Capture all relevant information
{
  echo "=== Claude Spawn Request ==="
  echo "Timestamp: $(date -Iseconds)"
  echo "Working Directory: $(pwd)"
  echo ""
  echo "=== Arguments ==="
  echo "Count: $#"
  for i in $(seq 1 $#); do
    echo "  [$i]: ${!i}"
  done
  echo ""
  echo "=== Environment Variables ==="
  echo "PATH: ${PATH:-<not set>}"
  echo "HOME: ${HOME:-<not set>}"
  echo "USER: ${USER:-<not set>}"
  echo "PWD: ${PWD:-<not set>}"
  echo "SHIPYARD_STATE_DIR: ${SHIPYARD_STATE_DIR:-<not set>}"
  echo "SHIPYARD_WEB_URL: ${SHIPYARD_WEB_URL:-<not set>}"
  echo "DAEMON_PORT: ${DAEMON_PORT:-<not set>}"
  echo ""
  echo "=== Full Environment (filtered) ==="
  env | grep -E '^(SHIPYARD_|CLAUDE_|DAEMON_|REGISTRY_)' || echo "(no matching vars)"
  echo ""
  echo "=== End Request ==="
} > "$LOG_FILE"

# Log to stderr for visibility in container logs
echo "[claude-shim] Logged spawn request to: $LOG_FILE" >&2

# Exit successfully - daemon expects Claude to return cleanly
exit 0
