# Registry Server Spike - Test Checklist

Use this checklist to validate the spike is working correctly.

## Setup Tests

- [ ] Dependencies install successfully with `pnpm install`
- [ ] No TypeScript/JavaScript errors in any files
- [ ] All scripts are executable (`chmod +x *.sh`)

## Registry Server Tests

### Basic Functionality
- [ ] Registry server starts on port 3001
- [ ] Can access `http://localhost:3001/registry` in browser
- [ ] Returns valid JSON response
- [ ] Returns empty servers array when no servers registered

### CORS Headers
- [ ] Response includes `Access-Control-Allow-Origin: *`
- [ ] Browser can fetch registry without CORS errors
- [ ] OPTIONS preflight requests handled correctly

### File Operations
- [ ] Creates `~/.shipyard/` directory if it doesn't exist
- [ ] Reads `servers.json` file successfully
- [ ] Returns empty array if file doesn't exist (no crash)

## WebSocket Server Tests

### Registration
- [ ] WS server starts on specified port (e.g., 3100)
- [ ] WS server creates `~/.shipyard/servers.json` if needed
- [ ] WS server adds entry to registry file
- [ ] Entry includes: port, url, pid, startedAt
- [ ] Multiple WS servers can register without conflicts

### Connection Handling
- [ ] Accepts WebSocket connections
- [ ] Sends welcome message on connection
- [ ] Echoes messages back to client
- [ ] Logs client connections/disconnections

### Cleanup
- [ ] Removes entry from registry on SIGINT (Ctrl+C)
- [ ] Removes entry from registry on SIGTERM
- [ ] Closes all connections gracefully on shutdown

## Browser Client Tests

### Discovery
- [ ] Fetches registry from `http://localhost:3001/registry`
- [ ] Displays discovered servers
- [ ] Shows server count
- [ ] Updates registry status badge

### Connection Management
- [ ] Connects to discovered servers
- [ ] Shows connection status for each server
- [ ] Updates UI when connection established
- [ ] Updates UI when connection lost

### UI Features
- [ ] "Discover Servers" button fetches registry
- [ ] "Connect All" button connects to all servers
- [ ] "Disconnect All" button disconnects from all
- [ ] "Send Test Message" sends to all connected servers
- [ ] Individual connect/disconnect per server works
- [ ] "Clear Log" clears message log

### Message Handling
- [ ] Receives welcome message on connection
- [ ] Receives echo responses from servers
- [ ] Logs sent messages
- [ ] Logs received messages
- [ ] Logs connection events
- [ ] Timestamps are accurate

### Error Handling
- [ ] Handles registry fetch failures gracefully
- [ ] Handles connection failures gracefully
- [ ] Shows error messages in log
- [ ] Disables buttons appropriately when disconnected

## Integration Tests

### Multi-Server Scenario
- [ ] Start 3 WS servers (ports 3100, 3101, 3102)
- [ ] All 3 appear in browser discovery
- [ ] Can connect to all 3 simultaneously
- [ ] Can send messages to all 3
- [ ] Each server echoes back correctly
- [ ] Stop one server, browser detects disconnection
- [ ] Other servers remain connected

### Quick Start Script
- [ ] `./start-all.sh` starts all servers
- [ ] Registry server starts on 3001
- [ ] WS servers start on 3100, 3101, 3102
- [ ] All servers register successfully
- [ ] Browser can connect to all
- [ ] Ctrl+C stops all servers cleanly

### Recovery Scenarios
- [ ] Start WS servers before registry server
- [ ] Start registry server before WS servers
- [ ] Restart registry server while WS servers running
- [ ] Restart WS server (removes old entry, adds new)
- [ ] Kill WS server (registry has stale entry - expected)

## Performance Tests

- [ ] Registry fetch completes in < 100ms
- [ ] WebSocket connections establish in < 500ms
- [ ] Message echo round-trip < 50ms
- [ ] Browser handles 3+ concurrent connections without lag

## Documentation Tests

- [ ] README.md has clear setup instructions
- [ ] README.md has architecture diagram
- [ ] REGISTRY-FORMAT.md documents file structure
- [ ] TEST-CHECKLIST.md (this file) covers all scenarios
- [ ] Code has clear comments

## Success Criteria Summary

All of these must be true:

1. Registry server runs on port 3001
2. Multiple WS servers register successfully
3. Browser fetches registry from HTTP endpoint
4. Browser connects to all discovered servers
5. Shows connection status for each server
6. Handles server disconnections gracefully
7. No CORS errors
8. No crashes or unhandled errors
9. Clean shutdown with Ctrl+C

## Known Limitations (Expected)

These are acceptable for a spike:

- Stale entries when servers crash (no cleanup)
- No file locking (potential race conditions)
- No health checks or heartbeats
- No authentication or security
- No TLS/WSS support
- Single registry file (no clustering)

## Notes

- Use browser DevTools Network tab to inspect requests
- Use browser DevTools Console to see WebSocket events
- Check terminal output for server logs
- Registry file located at `~/.shipyard/servers.json`
