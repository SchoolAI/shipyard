#!/usr/bin/env bash
#
# Launch Shipyard in isolated Docker containers with worktree-aware port configuration.
#
# This script:
#   1. Detects the current worktree (from git branch or directory name)
#   2. Generates unique ports using worktree-env.sh
#   3. Creates .env.docker with all port assignments
#   4. Runs docker compose with the generated environment
#
# Usage:
#   pnpm dev:isolated          # From any worktree
#   ./scripts/dev-isolated.sh  # Direct execution
#
# The script ensures multiple worktrees can run simultaneously without port conflicts,
# each with their own Docker network and volumes.

set -e

# Get the directory where this script lives
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Change to project root for Docker context
cd "$PROJECT_ROOT"

# Detect worktree name from git branch or directory
WORKTREE_NAME=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || basename "$PROJECT_ROOT")

echo "=== Shipyard Isolated Dev Environment ==="
echo "Worktree: $WORKTREE_NAME"
echo ""

# Generate environment file from worktree-env.sh
ENV_FILE="$PROJECT_ROOT/.env.docker"

# Source worktree-env.sh to get port assignments
if [ -f "$SCRIPT_DIR/worktree-env.sh" ]; then
  # Capture the environment variable exports
  eval "$("$SCRIPT_DIR/worktree-env.sh" "$WORKTREE_NAME")"
else
  echo "Error: worktree-env.sh not found" >&2
  exit 1
fi

# Generate .env.docker file for docker compose
cat > "$ENV_FILE" << EOF
# Auto-generated environment for worktree: ${WORKTREE_NAME}
# Generated at: $(date -Iseconds)
# Do not edit manually - regenerated on each dev:isolated run

# Worktree identification (used for volume/network naming)
WORKTREE_NAME=${WORKTREE_NAME}

# Server ports
REGISTRY_PORT=${REGISTRY_PORT}
SIGNALING_PORT=${PORT}
VITE_PORT=${VITE_PORT}
OAUTH_PORT=${OAUTH_PORT}
OG_PROXY_PORT=${OG_PROXY_PORT}
DAEMON_PORT=${DAEMON_PORT}

# Vite browser-side environment variables
VITE_WEBRTC_SIGNALING=ws://localhost:${PORT}
VITE_GITHUB_OAUTH_WORKER=http://localhost:${OAUTH_PORT}
VITE_OG_PROXY_URL=http://localhost:${OG_PROXY_PORT}
VITE_REGISTRY_PORT=${REGISTRY_PORT}
VITE_DAEMON_WS_URL=ws://localhost:${DAEMON_PORT}

# Home directory for volume mounts
HOME=${HOME}
EOF

echo "Generated .env.docker with ports:"
echo "  Registry:   ${REGISTRY_PORT}"
echo "  Signaling:  ${PORT}"
echo "  Vite:       ${VITE_PORT}"
echo "  OAuth:      ${OAUTH_PORT}"
echo "  OG Proxy:   ${OG_PROXY_PORT}"
echo "  Daemon:     ${DAEMON_PORT}"
echo ""

# Cleanup function to run on exit
cleanup() {
  echo ""
  echo "Shutting down containers..."
  docker compose --env-file "$ENV_FILE" down
  echo "Cleanup complete."
}

# Trap EXIT to ensure cleanup runs
trap cleanup EXIT

# Run docker compose with the generated environment
echo "Starting containers..."
echo ""
docker compose --env-file "$ENV_FILE" up --build
