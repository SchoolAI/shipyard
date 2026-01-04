#!/bin/bash

# Test the registry server by starting it and fetching the registry

echo "Starting registry server on port 3001..."
node registry-server.js &
REGISTRY_PID=$!

# Wait for server to start
sleep 2

echo ""
echo "Testing registry endpoint..."
echo ""

# Test the /registry endpoint
echo "GET http://localhost:3001/registry"
echo "---"
curl -s http://localhost:3001/registry | jq '.' || curl -s http://localhost:3001/registry

echo ""
echo ""
echo "Registry server is running. Press Ctrl+C to stop."
echo "Open http://localhost:3001 in your browser to see the test page."
echo ""

# Wait for Ctrl+C
trap "echo 'Stopping registry server...'; kill $REGISTRY_PID 2>/dev/null; exit 0" SIGINT SIGTERM
wait $REGISTRY_PID
