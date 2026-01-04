#!/bin/bash

# Quick test script to verify the spike works
# This starts 3 servers, shows the registry, then cleans up

echo "Starting 3 WebSocket servers..."
echo ""

# Start 3 servers in the background
node ws-server.js &
PID1=$!
sleep 0.5

node ws-server.js &
PID2=$!
sleep 0.5

node ws-server.js &
PID3=$!
sleep 0.5

echo ""
echo "Registry contents:"
cat ~/.peer-plan/servers.json
echo ""

echo "Servers running. Press Ctrl+C to stop all servers."
echo ""
echo "To test in browser:"
echo "  1. Run 'npm run dev' in another terminal"
echo "  2. Open http://localhost:5173"
echo "  3. You should see 3 connected servers"
echo ""

# Wait for Ctrl+C
trap 'echo ""; echo "Stopping servers..."; kill $PID1 $PID2 $PID3 2>/dev/null; sleep 2; echo "Registry after cleanup:"; cat ~/.peer-plan/servers.json 2>/dev/null || echo "Registry cleaned up"; exit 0' INT

wait
