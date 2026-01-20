# Port Range Scanning Spike

Testing browser discovery of WebSocket servers via port range scanning (1234-1244).

## Goal

Prove that a browser can discover WebSocket servers by scanning a range of ports and connecting to all discovered servers.

## What This Tests

1. Multiple WebSocket servers running on different ports in a range
2. Browser scanning ports in parallel to find active servers
3. Connecting to all discovered servers simultaneously
4. Handling connection failures gracefully with timeouts
5. Real-time message exchange with multiple servers

## Files

- `ws-server.js` - Simple WebSocket echo server that runs on a random port in range
- `index.html` - Browser UI that scans ports and connects to servers
- `package.json` - Dependencies (just `ws` package)

## Setup

```bash
# Install dependencies
npm install
```

## Testing

### Step 1: Start Multiple Servers

In separate terminal windows, start 2-3 server instances:

```bash
# Terminal 1
npm run server

# Terminal 2
npm run server

# Terminal 3
npm run server
```

Each server will automatically pick a random port in the range 1234-1244. If a port is already in use, it will try another.

You can also specify a port:

```bash
node ws-server.js 1234
```

### Step 2: Open Browser UI

Open `index.html` in your browser (or use a simple HTTP server):

```bash
# Option 1: Direct file open
open index.html

# Option 2: With HTTP server
npx serve .
# Then open http://localhost:3000
```

### Step 3: Scan and Connect

1. Click "Scan Ports" - Browser will probe all ports 1234-1244
2. Active ports will be highlighted in green
3. Click "Connect to All" - Browser connects to all active servers
4. Click "Send Test Message" - Sends a message to all connected servers
5. Watch the message log for responses

## What to Observe

### Server Console

Each server logs:
- Port it's running on
- Server ID (unique identifier)
- Client connections/disconnections
- Messages received from clients

### Browser UI

Shows:
- Grid of all ports (1234-1244) with status
- Active ports highlighted (green)
- Connected ports highlighted (blue)
- Inactive ports shown (red)
- Real-time statistics:
  - Total ports scanned
  - Active ports found
  - Connected ports
  - Scan time (ms)
- Message log showing all communication

### Expected Behavior

1. Scan completes in ~500ms (parallel probing with 500ms timeout per port)
2. All active servers are discovered
3. Browser connects to all discovered servers
4. Each server sends a welcome message with its ID
5. Test messages are echoed back by all servers
6. Connection failures are handled gracefully

## Architecture Notes

### Port Probing Strategy

- Parallel scanning (all ports at once)
- 500ms timeout per port
- Creates temporary WebSocket connection
- Closes immediately after confirming server exists
- Fast and efficient discovery

### Connection Management

- Separate WebSocket connections to each server
- Each connection has unique message handling
- Automatic reconnection possible (not implemented in this spike)
- Graceful handling of server shutdown

### Message Protocol

Simple JSON messages:

```json
// Welcome message (server -> browser)
{
  "type": "welcome",
  "serverId": "server-1234-1234567890",
  "port": 1234,
  "timestamp": 1234567890
}

// Echo message (server -> browser)
{
  "type": "echo",
  "serverId": "server-1234-1234567890",
  "port": 1234,
  "original": { /* original message */ },
  "timestamp": 1234567890
}

// Test message (browser -> server)
{
  "type": "test",
  "message": "Hello from browser!",
  "timestamp": 1234567890
}
```

## Success Criteria

- [x] Multiple WebSocket servers run on random ports in range
- [x] Browser successfully scans all ports in parallel
- [x] Browser finds all active servers
- [x] Browser connects to multiple servers simultaneously
- [x] Connection status shown for each port
- [x] Connection failures handled gracefully
- [x] Messages sent/received from all connected servers
- [x] UI updates in real-time

## Key Findings

1. **Parallel scanning is fast** - 500ms timeout means scan completes quickly even with 11 ports
2. **Multiple connections work** - Browser can maintain connections to all servers
3. **Port range discovery is viable** - Practical for discovering local development servers
4. **Timeout is important** - Without timeout, inactive ports would block discovery
5. **UI feedback is essential** - Visual indication of port status helps debugging

## Limitations

- Only works on localhost (CORS/security restrictions for remote hosts)
- Port range must be known in advance
- No automatic reconnection (could be added)
- No service discovery metadata (servers just echo, don't advertise capabilities)

## Next Steps for shipyard

This spike proves the concept. For production:

1. Add service discovery handshake (servers advertise plan IDs, capabilities)
2. Implement automatic reconnection on disconnect
3. Add connection pooling/management
4. Consider alternative discovery methods (mDNS, broadcast)
5. Add authentication/security layer
6. Handle network changes (wifi switch, etc)

## Troubleshooting

### "Port already in use"

If you get EADDRINUSE errors:
1. Check what's using the port: `lsof -i :1234`
2. Kill the process: `kill -9 <PID>`
3. Or let the server pick another random port

### Browser can't connect

1. Check firewall settings
2. Verify servers are running: `lsof -i :1234-1244`
3. Check browser console for errors
4. Try opening index.html via HTTP server instead of file://

### Scan finds no servers

1. Verify servers started successfully (check terminal output)
2. Check if ports are in the expected range
3. Increase PROBE_TIMEOUT in index.html (line 216)
4. Check browser console for WebSocket errors

---

**Created:** 2026-01-03
**Purpose:** Proof of concept for browser-based WebSocket server discovery
