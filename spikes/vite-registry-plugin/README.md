# WebSocket Registry Discovery Spike

## Goal

Prove that a browser can discover multiple WebSocket servers running on dynamic ports via a Vite plugin that serves a registry file.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  ~/.shipyard/servers.json (Registry File)                 │
│  {                                                          │
│    "servers": [                                             │
│      { "id": "server-1", "port": 54321, "pid": 12345 },    │
│      { "id": "server-2", "port": 54322, "pid": 12346 }     │
│    ]                                                        │
│  }                                                          │
│                                                             │
└────────────┬────────────────────────────────┬───────────────┘
             │                                │
             │ Writes on startup/shutdown     │ Reads on request
             │                                │
   ┌─────────▼──────────┐          ┌─────────▼──────────────┐
   │                    │          │                        │
   │  ws-server.js      │          │  Vite Dev Server       │
   │  (multiple)        │          │  (vite.config.ts)      │
   │                    │          │                        │
   │  • Random port     │          │  Plugin serves         │
   │  • WebSocket echo  │          │  /api/registry         │
   │  • Registry write  │          │                        │
   │                    │          │                        │
   └────────────────────┘          └────────┬───────────────┘
                                            │
                                            │ GET /api/registry
                                            │
                                   ┌────────▼───────────┐
                                   │                    │
                                   │  Browser           │
                                   │  (index.html)      │
                                   │                    │
                                   │  • Fetch registry  │
                                   │  • Connect to all  │
                                   │  • Show status     │
                                   │                    │
                                   └────────────────────┘
```

## Components

### 1. ws-server.js
- Simple WebSocket echo server
- Uses port 0 to get a random available port
- Writes port to `~/.shipyard/servers.json` on startup
- Removes entry from registry on shutdown (SIGINT/SIGTERM)
- Each server has a unique ID

### 2. vite.config.ts
- Custom Vite plugin that serves the registry file at `/api/registry`
- Reads from `~/.shipyard/servers.json`
- Sets CORS headers for browser access
- Returns empty array if no registry file exists

### 3. index.html
- Fetches `/api/registry` on load and every 5 seconds
- Connects to ALL discovered WebSocket servers
- Shows connection status (connected/disconnected/connecting)
- Allows sending test messages to all connected servers
- Displays all messages received from servers

## Installation

```bash
npm install
```

This installs:
- `ws` - WebSocket server library
- `vite` - Dev server with registry plugin

## Usage

### Step 1: Start the Vite dev server

In one terminal:

```bash
npm run dev
```

This starts Vite on http://localhost:5173

### Step 2: Start WebSocket servers

In separate terminals, start 2-3 server instances:

**Terminal 2:**
```bash
npm run server
```

**Terminal 3:**
```bash
npm run server
```

**Terminal 4:**
```bash
npm run server
```

Each server will:
1. Start on a random port (e.g., 54321, 54322, 54323)
2. Register itself in `~/.shipyard/servers.json`
3. Log: `[server-xxx] WebSocket server listening on port 54321`

### Step 3: Open the browser

Navigate to http://localhost:5173

You should see:
- "Found 3 servers" (or however many you started)
- A card for each server showing:
  - Server ID
  - Port number
  - PID
  - Connection status
- All servers should show "Connected" status

### Step 4: Test messaging

1. Type a message in the input field (e.g., "Hello from browser!")
2. Click "Send Test Message" (or press Enter)
3. You should see:
   - "Sent: Hello from browser!" for each server
   - Echo responses from each server: "[server-xxx] Echo: Hello from browser!"

### Step 5: Test disconnection

1. Stop one of the servers (Ctrl+C in its terminal)
2. Watch the browser:
   - That server's status should change to "Disconnected"
   - Registry should update to show fewer servers (on next refresh)

### Step 6: Test reconnection

1. Start a new server instance: `npm run server`
2. Within 5 seconds, the browser should:
   - Detect the new server
   - Automatically connect to it
   - Update the status to "Connected"

## Success Criteria

- ✅ Multiple WS servers run on random ports
- ✅ Browser fetches registry successfully
- ✅ Browser connects to ALL servers
- ✅ Shows connected/disconnected status
- ✅ Registry updates when servers start/stop
- ✅ Browser auto-discovers new servers (5s polling)
- ✅ Can send messages to all connected servers
- ✅ Receives echo responses from all servers

## Registry File Format

The registry file at `~/.shipyard/servers.json` has this structure:

```json
{
  "servers": [
    {
      "id": "server-1735946123456-abc123",
      "port": 54321,
      "pid": 12345,
      "startedAt": "2026-01-03T17:42:03.456Z"
    },
    {
      "id": "server-1735946123789-def456",
      "port": 54322,
      "pid": 12346,
      "startedAt": "2026-01-03T17:42:03.789Z"
    }
  ]
}
```

## Quick Reference

```bash
# Start dev server (serves registry at /api/registry)
npm run dev

# Start a WebSocket server (in separate terminal)
npm run server

# Quick test with 3 servers
./test.sh

# Check registry file
cat ~/.shipyard/servers.json

# Manual cleanup
rm ~/.shipyard/servers.json
```

## Cleanup

To manually clean the registry:

```bash
rm ~/.shipyard/servers.json
```

Servers automatically clean up their entries when they shut down gracefully (Ctrl+C).

## Key Learnings

1. **Dynamic Port Discovery**: Using port 0 lets the OS assign available ports
2. **Shared Registry**: File-based registry is simple and works across processes
3. **Vite Plugin**: Easy to extend Vite with custom middleware
4. **Graceful Cleanup**: Process signal handlers ensure registry stays clean
5. **Auto-Discovery**: Browser polling makes it feel "live" without WebSocket to registry

## Next Steps (not in this spike)

If you wanted to extend this pattern:
- Add authentication/tokens to registry entries
- Use WebSocket for registry updates (instead of polling)
- Add health checks to remove stale entries
- Store more metadata (session ID, capabilities, etc.)
- Use a database instead of JSON file for production

## Notes

- This spike intentionally avoids MCP, Yjs, and other complexity
- Focus is purely on the discovery mechanism
- In production, the MCP server would write to the registry
- The Vite plugin pattern works for both dev and production (could be adapted for static hosting)
