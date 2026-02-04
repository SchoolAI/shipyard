#!/usr/bin/env bash
#
# Launch Shipyard in isolated Docker containers.
#
# This script:
#   1. Generates .env.docker with fixed port assignments
#   2. Runs docker compose with the generated environment
#
# Usage:
#   pnpm dev:isolated          # Standard usage
#   ./scripts/dev-isolated.sh  # Direct execution

set -e

# Get the directory where this script lives
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Change to project root for Docker context
cd "$PROJECT_ROOT"

echo "=== Shipyard Isolated Dev Environment ==="
echo ""

# Fixed ports (matches env.ts defaults)
SERVER_PORT=4445
SESSION_PORT=4444
VITE_PORT=5173
OG_PROXY_PORT=4446

# Generate environment file
ENV_FILE="$PROJECT_ROOT/.env.docker"

cat > "$ENV_FILE" << EOF
# Auto-generated environment for Docker development
# Generated at: $(date -Iseconds)
# Do not edit manually - regenerated on each dev:isolated run

# Server ports
SESSION_PORT=${SESSION_PORT}
VITE_PORT=${VITE_PORT}
OG_PROXY_PORT=${OG_PROXY_PORT}
SERVER_PORT=${SERVER_PORT}

# Signaling server secrets (required for OAuth)
# Set these environment variables before running, or leave empty for testing
GITHUB_CLIENT_ID=\${GITHUB_CLIENT_ID:-}
GITHUB_CLIENT_SECRET=\${GITHUB_CLIENT_SECRET:-}
JWT_SECRET=\${JWT_SECRET:-}

# Logging (default to debug for development)
LOG_LEVEL=${LOG_LEVEL:-debug}

# Vite browser-side environment variables
VITE_WEBRTC_SIGNALING=ws://localhost:${SESSION_PORT}
VITE_GITHUB_OAUTH_WORKER=http://localhost:${SESSION_PORT}
VITE_OG_PROXY_URL=http://localhost:${OG_PROXY_PORT}
VITE_WS_PORT=${SERVER_PORT}

# Home directory for volume mounts
HOME=${HOME}
EOF

echo "Generated .env.docker with ports:"
echo "  Server:     ${SERVER_PORT}"
echo "  Session:    ${SESSION_PORT}"
echo "  Vite:       ${VITE_PORT}"
echo "  OG Proxy:   ${OG_PROXY_PORT}"
echo ""

# Check for port conflicts before starting
check_port() {
  local port=$1
  local name=$2
  if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo "⚠️  Warning: Port $port ($name) is already in use"
    return 1
  fi
  return 0
}

PORT_CONFLICT=0
check_port "$SERVER_PORT" "Server" || PORT_CONFLICT=1
check_port "$SESSION_PORT" "Session" || PORT_CONFLICT=1
check_port "$VITE_PORT" "Vite" || PORT_CONFLICT=1

if [ $PORT_CONFLICT -eq 1 ]; then
  echo ""
  echo "Port conflicts detected. Options:"
  echo "  1. Stop the conflicting services: pnpm cleanup"
  echo "  3. Press Ctrl+C to abort, or wait 5 seconds to continue anyway..."
  echo ""
  sleep 5
fi

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
