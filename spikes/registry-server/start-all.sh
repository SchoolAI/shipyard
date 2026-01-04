#!/bin/bash

# Quick start script to run the registry server spike
# This starts the registry server and 3 WebSocket servers

set -e

echo "Registry Server Discovery Spike"
echo "================================"
echo ""

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  pnpm install
  echo ""
fi

# Function to cleanup on exit
cleanup() {
  echo ""
  echo "Stopping all servers..."
  kill $(jobs -p) 2>/dev/null || true
  exit 0
}

trap cleanup SIGINT SIGTERM

# Start registry server
echo "Starting registry server on port 3001..."
node registry-server.js &
sleep 1

# Start WebSocket servers
echo "Starting WebSocket server on port 3100..."
node ws-server.js 3100 &
sleep 0.5

echo "Starting WebSocket server on port 3101..."
node ws-server.js 3101 &
sleep 0.5

echo "Starting WebSocket server on port 3102..."
node ws-server.js 3102 &
sleep 0.5

echo ""
echo "All servers started!"
echo ""
echo "Registry server: http://localhost:3001"
echo "WebSocket servers: ws://localhost:3100, ws://localhost:3101, ws://localhost:3102"
echo ""
echo "Open http://localhost:3001 in your browser to test"
echo ""
echo "Press Ctrl+C to stop all servers"

# Wait for all background jobs
wait
