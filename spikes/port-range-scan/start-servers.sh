#!/bin/bash

# Quick start script to launch multiple WebSocket servers
# Usage: ./start-servers.sh [number_of_servers]

NUM_SERVERS=${1:-3}

echo "Starting $NUM_SERVERS WebSocket servers..."
echo "Press Ctrl+C to stop all servers"
echo ""

# Array to store PIDs
pids=()

# Trap Ctrl+C to kill all servers
trap 'echo ""; echo "Stopping all servers..."; for pid in "${pids[@]}"; do kill $pid 2>/dev/null; done; exit' INT TERM

# Start servers
for i in $(seq 1 $NUM_SERVERS); do
  node ws-server.js &
  pid=$!
  pids+=($pid)
  echo "Started server $i (PID: $pid)"
  # Small delay to avoid port conflicts
  sleep 0.2
done

echo ""
echo "All servers started. Open index.html in your browser to test."
echo ""

# Wait for all background processes
wait
