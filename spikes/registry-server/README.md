# Registry Server Discovery Spike

> Testing browser discovery of WebSocket servers via a dedicated HTTP registry server.

## Problem

Browser needs to discover which WebSocket servers are running locally without hardcoding ports. We need a lightweight discovery mechanism that works with multiple MCP server instances.

## Solution

Run a dedicated HTTP registry server on a known port (3001) that serves a JSON registry of active WebSocket servers. Each WS server registers itself by writing to `~/.peer-plan/servers.json` on startup.

## Architecture

```
~/.peer-plan/servers.json (file)
         ↑
         │ write on startup
         │
    [WS Server 1:3100]
    [WS Server 2:3101]
    [WS Server 3:3102]
         ↑
         │ read registry
         │
[Registry Server :3001] ← HTTP GET /registry ← [Browser]
```

## Files

- `registry-server.js` - HTTP server on port 3001, serves registry JSON with CORS
- `ws-server.js` - WebSocket server that registers itself on startup
- `index.html` - Browser client that discovers and connects to all servers
- `package.json` - Dependencies (minimal)
- `start-all.sh` - Quick start script that runs everything
- `test-registry.sh` - Test just the registry server
- `REGISTRY-FORMAT.md` - Documentation of registry file format

## Running the Spike

### Quick Start (Recommended)

```bash
# Install dependencies and start everything
pnpm install
./start-all.sh
```

This starts:
- Registry server on port 3001
- WebSocket servers on ports 3100, 3101, 3102

Then open http://localhost:3001 in your browser.

### Manual Start (Step by Step)

#### 1. Install dependencies

```bash
pnpm install
```

#### 2. Start registry server (in one terminal)

```bash
node registry-server.js
```

Should output:
```
Registry server running at http://localhost:3001
Serving registry from: /Users/you/.peer-plan/servers.json
```

#### 3. Start WebSocket servers (in separate terminals)

```bash
# Terminal 2
node ws-server.js 3100

# Terminal 3
node ws-server.js 3101

# Terminal 4
node ws-server.js 3102
```

Each should output:
```
WebSocket server listening on port 3100
Registered with registry: /Users/you/.peer-plan/servers.json
```

#### 4. Open browser

```bash
open http://localhost:3001
```

Or open `index.html` directly in your browser.

### 5. Test discovery

Browser should:
- Fetch registry from `http://localhost:3001/registry`
- Display all discovered servers
- Connect WebSocket to each server
- Show connection status (connected/disconnected)
- Send test messages

## Expected Behavior

1. Registry server starts and watches `~/.peer-plan/servers.json`
2. Each WS server writes its entry to registry file on startup
3. Browser fetches registry via HTTP GET
4. Browser establishes WebSocket connections to all discovered servers
5. Browser shows real-time connection status for each server
6. When WS server stops, browser detects disconnection

## Success Criteria

- ✅ Registry server runs on port 3001
- ✅ Multiple WS servers register successfully
- ✅ Browser fetches registry from HTTP endpoint
- ✅ Browser connects to all discovered servers
- ✅ Shows connection status for each server
- ✅ Handles server disconnections gracefully

## Key Learnings

This spike validates:
- File-based registry with HTTP server is simple and works
- No need for complex service discovery
- CORS is required for browser access
- WebSocket connections can be established dynamically
- Connection status can be tracked per-server

## Complete File List

| File | Purpose | Size |
|------|---------|------|
| `registry-server.js` | HTTP server for registry | 3.1 KB |
| `ws-server.js` | WebSocket server with registration | 4.1 KB |
| `index.html` | Browser test client | 11 KB |
| `package.json` | Dependencies | 300 B |
| `start-all.sh` | Quick start all servers | 1.2 KB |
| `test-registry.sh` | Test registry server only | 724 B |
| `README.md` | Main documentation | 3.8 KB |
| `REGISTRY-FORMAT.md` | File format specification | 2.6 KB |
| `TEST-CHECKLIST.md` | Comprehensive test scenarios | 4.8 KB |
| `SUMMARY.md` | Findings and recommendations | 4.5 KB |
| `VERIFICATION.md` | Test results | 2.5 KB |
| `.gitignore` | Ignore patterns | 70 B |

## Verification Results

See `VERIFICATION.md` for test results. Summary:

- Registry server: PASSED
- WS server registration: PASSED
- WS server cleanup: PASSED
- File format: PASSED
- Dependencies: PASSED

**Status:** SUCCESSFUL - Ready for integration

## Next Steps

If successful, integrate into:
- `packages/server/` - MCP server registers on startup
- `packages/web/` - React app fetches registry and connects
- Add health checks and stale entry cleanup
