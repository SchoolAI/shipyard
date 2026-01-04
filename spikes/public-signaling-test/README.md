# Public Signaling Server Test

Test script to verify y-webrtc public signaling servers are working.

## Background

y-webrtc uses signaling servers for WebRTC peer discovery. The signaling server:
1. Maintains a map of topics to connected clients
2. Allows clients to subscribe to topics (room names)
3. Forwards publish messages between clients on the same topic
4. Responds to ping with pong (health check)

## Known Public Servers

| Server | Status | Notes |
|--------|--------|-------|
| `wss://signaling.yjs.dev` | **DEAD** | DNS lookup fails (domain not resolving) |
| `wss://y-webrtc-signaling-eu.herokuapp.com` | **DEAD** | Returns 404 (app removed) |
| `wss://y-webrtc-signaling-us.herokuapp.com` | **DEAD** | Returns 404 (app removed) |

### Test Results (January 2026)

```
$ node test-connection.js

Testing: wss://signaling.yjs.dev
  Error: getaddrinfo ENOTFOUND signaling.yjs.dev

Testing: wss://y-webrtc-signaling-us.herokuapp.com
  Error: Unexpected server response: 404

Testing: wss://y-webrtc-signaling-eu.herokuapp.com
  Error: Unexpected server response: 404

--- SUMMARY ---
FAILED: wss://signaling.yjs.dev
FAILED: wss://y-webrtc-signaling-us.herokuapp.com
FAILED: wss://y-webrtc-signaling-eu.herokuapp.com

RECOMMENDATION: No public servers working. Deploy your own.
```

### Why They Failed

1. **signaling.yjs.dev** - DNS no longer resolves. The domain appears to have been shut down.
2. **Heroku servers** - Heroku discontinued their free tier in November 2022. These apps have been removed.

According to the [Yjs community discussion](https://discuss.yjs.dev/t/is-the-public-signaling-server-that-ships-by-default-with-y-webrtc-still-working/1979):

- Users reported these issues as early as 2024
- The Yjs maintainer has "moved on to other things"
- **Recommendation: Always deploy your own signaling server**

## Usage

```bash
# Install dependencies
pnpm install

# Test all known public servers
node test-connection.js

# Test a specific server
node test-connection.js wss://signaling.yjs.dev

# Test your local server
node test-connection.js ws://localhost:4444
```

## What the Test Does

1. **Connect** - Opens WebSocket connection to the server
2. **Subscribe** - Subscribes to a unique test topic (verifies message sending works)
3. **Ping/Pong** - Sends a ping message and waits for pong response (verifies server protocol)

If all steps succeed, the server is working correctly.

### Local Server Test

```
$ pnpm dev:signaling  # In one terminal
$ node test-connection.js ws://localhost:4444  # In another

Testing: ws://localhost:4444
  Connected (17ms)
  Subscribe sent
  Ping/Pong works (2ms)

--- SUMMARY ---
WORKING: ws://localhost:4444

RECOMMENDATION: Use ws://localhost:4444
```

## Signaling Protocol

The y-webrtc signaling protocol (from `apps/signaling/src/server.js`):

```javascript
// Subscribe to topics (rooms)
{ type: 'subscribe', topics: ['room-name-1', 'room-name-2'] }

// Unsubscribe from topics
{ type: 'unsubscribe', topics: ['room-name'] }

// Publish message to all subscribers of a topic
{ type: 'publish', topic: 'room-name', data: { ... } }

// Ping (health check)
{ type: 'ping' }

// Pong (response to ping)
{ type: 'pong' }
```

## Recommendation for peer-plan

Since public servers are unreliable, peer-plan should:

1. **Development**: Use local signaling server (`pnpm dev:signaling`)
2. **Production**: Deploy `apps/signaling` to a platform like:
   - Fly.io
   - Railway
   - Render
   - Cloudflare Workers (with Durable Objects)

### Local Development Setup

```bash
# Start local signaling server
pnpm dev:signaling

# Configure web app to use local server
# In apps/web/.env:
VITE_WEBRTC_SIGNALING=ws://localhost:4444
```

### Production Deployment

See `apps/signaling/README.md` for deployment instructions.

## Alternative: Self-Hosted Options

If you need a public signaling server:

1. **Deno Deploy** - See `spikes/deno-signaling/` for a Deno-compatible version
2. **Cloudflare Workers** - Stateless but can use Durable Objects for state
3. **Fly.io** - Easiest for Node.js deployment

## Known Issues

1. **No authentication** - Public servers have no auth, anyone can join any room
2. **No encryption by default** - Messages are sent in plaintext (use y-webrtc's `password` option for encryption)
3. **Single point of failure** - If the signaling server is down, no new peer connections can be established
4. **Existing connections survive** - Once WebRTC connections are established, they work without the signaling server

## References

- [y-webrtc GitHub](https://github.com/yjs/y-webrtc)
- [Yjs Community Discussion](https://discuss.yjs.dev/t/is-the-public-signaling-server-that-ships-by-default-with-y-webrtc-still-working/1979)
- [Tag1 Consulting: Signaling Servers and y-webrtc](https://www.tag1consulting.com/blog/signal-y-webrtc-part2)
