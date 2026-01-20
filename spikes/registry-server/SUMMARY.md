# Registry Server Spike - Summary

## What This Spike Proves

This spike validates that a **file-based registry with dedicated HTTP server** is a viable approach for browser discovery of WebSocket servers in shipyard.

## Key Findings

### 1. Simple Architecture Works
- HTTP server on known port (3001) serves registry JSON
- WebSocket servers self-register by writing to shared file
- Browser fetches registry via HTTP GET
- No need for complex service discovery protocols

### 2. CORS Is Required
- Browser requires CORS headers to fetch registry
- Registry server must include `Access-Control-Allow-Origin: *`
- OPTIONS preflight must be handled for cross-origin requests

### 3. File-Based Registry Is Adequate
- Simple JSON file at `~/.shipyard/servers.json`
- Each WS server manages its own entry
- Registry server only reads (never writes)
- Works for local development without database

### 4. Connection Management Works
- Browser can dynamically connect to discovered servers
- Connection status tracked per-server
- Disconnections detected automatically
- Multiple concurrent connections work fine

## Implementation Details

### Registry Server (Port 3001)
```javascript
// Endpoints:
GET /registry      - Returns JSON list of servers
GET /              - Serves test HTML page
OPTIONS /*         - CORS preflight
```

### WebSocket Server (Any Port)
```javascript
// Lifecycle:
1. Start on port (e.g., 3100)
2. Register in ~/.shipyard/servers.json
3. Accept WebSocket connections
4. On shutdown: unregister from file
```

### Browser Client
```javascript
// Flow:
1. Fetch http://localhost:3001/registry
2. Parse server list
3. Connect WebSocket to each server
4. Track connection status
5. Handle messages and disconnections
```

## Files Created

| File | Purpose | Lines |
|------|---------|-------|
| `registry-server.js` | HTTP server for registry | ~110 |
| `ws-server.js` | WebSocket server with registration | ~150 |
| `index.html` | Browser test client | ~380 |
| `package.json` | Dependencies | ~10 |
| `start-all.sh` | Quick start script | ~50 |
| `test-registry.sh` | Test registry only | ~25 |
| `README.md` | Documentation | ~130 |
| `REGISTRY-FORMAT.md` | File format spec | ~130 |
| `TEST-CHECKLIST.md` | Test scenarios | ~200 |

**Total:** ~1,185 lines of code and documentation

## What Works

- Multiple WS servers register successfully
- Browser discovers all registered servers
- WebSocket connections established dynamically
- Real-time connection status tracking
- Message echo (send/receive)
- Graceful shutdown with cleanup
- CORS handled correctly
- Empty registry handled (no crash)

## Known Limitations

These are acceptable for the spike but should be addressed in production:

1. **No stale entry cleanup** - Crashed servers leave entries
2. **No file locking** - Race conditions possible with concurrent writes
3. **No health checks** - Can't distinguish crashed vs running servers
4. **No authentication** - Anyone can connect
5. **No TLS** - Plain HTTP/WS only
6. **Single file** - Not suitable for distributed deployment

## Integration Path

To integrate into shipyard:

### 1. MCP Server (`packages/server/`)
```typescript
// On startup:
- Start WebSocket server on dynamic port
- Register in ~/.shipyard/servers.json
- Start registry server on port 3001 (if not running)

// On shutdown:
- Unregister from registry
- Close WebSocket server
```

### 2. Web App (`packages/web/`)
```typescript
// On load:
- Fetch http://localhost:3001/registry
- Connect to all discovered servers via y-websocket

// Yjs provider setup:
const providers = servers.map(server =>
  new WebsocketProvider(server.url, 'room', doc)
);
```

### 3. Production Enhancements
- Add health checks (heartbeat every 30s)
- Add stale entry cleanup (remove entries > 5min old)
- Add file locking for concurrent writes
- Add server metadata (name, capabilities, version)
- Consider moving to WebSocket-based registry (push updates)

## Recommendation

**Proceed with this approach.** The file-based registry with HTTP server is:
- Simple to implement
- Easy to debug
- Sufficient for local development
- Works with multiple MCP instances
- No external dependencies

The limitations are acceptable for a local development tool and can be enhanced incrementally.

## Next Steps

1. Integrate registry logic into `packages/server/src/registry.ts`
2. Update `packages/server/src/ws-server.ts` to register on startup
3. Update `packages/web/src/main.tsx` to discover and connect
4. Add health checks and cleanup
5. Add tests for registry operations
6. Document registry protocol in `docs/architecture.md`

## Test Results

See `TEST-CHECKLIST.md` for comprehensive test scenarios.

Quick test:
```bash
cd /Users/jacobpetterle/Working Directory/shipyard/spikes/registry-server
pnpm install
./start-all.sh
# Open http://localhost:3001 in browser
```

Expected result: All 3 servers discovered and connected successfully.
