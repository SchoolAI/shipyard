# Cloudflare Workers Signaling Server Spike

WebRTC signaling server for shipyard using Cloudflare Workers and Durable Objects with WebSocket Hibernation.

## Overview

This spike explores deploying the y-webrtc signaling server to Cloudflare Workers. The key advantage is **WebSocket Hibernation** which allows the Durable Object to sleep while maintaining open WebSocket connections, dramatically reducing costs.

## Architecture

```
Browser A ─────────────┐
                       │
Browser B ─────────────┼──► Cloudflare Worker ──► Durable Object (SignalingRoom)
                       │         (edge)            (single global instance)
Browser C ─────────────┘
```

### How It Works

1. **Worker Entry Point** (`src/index.ts`): Handles incoming requests at the edge, upgrades to WebSocket, routes to Durable Object
2. **SignalingRoom DO** (`src/signaling.ts`): Manages WebSocket connections and topic subscriptions with hibernation support

### y-webrtc Protocol Support

The server implements the y-webrtc signaling protocol:

| Message Type | Direction | Description |
|-------------|-----------|-------------|
| `subscribe` | Client -> Server | Subscribe to room topics (plan IDs) |
| `unsubscribe` | Client -> Server | Leave room topics |
| `publish` | Client -> Server -> Clients | Broadcast to topic subscribers |
| `ping` | Client -> Server | Keepalive (auto-responded via hibernation API) |
| `pong` | Server -> Client | Keepalive response |

### WebSocket Hibernation

The Durable Object uses the [WebSocket Hibernation API](https://developers.cloudflare.com/durable-objects/best-practices/websockets/) which:

- Allows the DO to be evicted from memory during inactivity
- Maintains WebSocket connections even when hibernated
- Wakes the DO when a message arrives
- Auto-responds to ping messages without waking the DO

This is critical for cost savings since signaling connections are mostly idle (brief bursts during peer connection, then silence).

## Cost Analysis

### Free Tier (Workers Free Plan)

| Resource | Free Limit | Notes |
|----------|-----------|-------|
| Requests | 100,000/day | WebSocket messages count at 20:1 ratio |
| Duration (GB-s) | 13,000/day | Hibernation reduces this dramatically |
| Storage | 5 GB total | We don't use storage (stateless) |
| DO Classes | 100 max | We use 1 class |

**WebSocket Message Math:**
- 100,000 requests/day = 2,000,000 WebSocket messages/day (20:1 ratio)
- For shipyard: Signaling is ~10-20 messages per peer connection
- Free tier supports: ~100,000+ peer connections/day

### Paid Tier ($5/month minimum)

| Resource | Included | Overage |
|----------|----------|---------|
| Requests | 1M/month | $0.15/million |
| Duration | 400,000 GB-s/month | $12.50/million GB-s |
| Storage | Not billed until Jan 2026 | $0.20/GB-month after |

**Cost Estimation (with hibernation):**
- Typical signaling: ~50ms CPU per connection handshake
- 10,000 connections/month = ~500 seconds = negligible cost
- Main cost is the $5/month minimum

### Comparison to Current Setup

| Metric | Fly.io/Railway | Cloudflare Workers |
|--------|----------------|-------------------|
| Monthly Cost | ~$5-7/month | $0 (free tier) or $5/month |
| Idle Cost | Charged | Free (hibernation) |
| Cold Start | ~500ms (container) | ~0ms (edge) |
| Global Distribution | Single region | 300+ edge locations |
| WebSocket Timeout | Container timeout | Unlimited (hibernation) |

## Rate Limiting

Cloudflare provides built-in protections:

1. **Soft limit**: 1,000 requests/second per Durable Object
2. **Queueing**: Requests queue briefly if overloaded, then error
3. **DDoS Protection**: Enterprise-grade at edge level
4. **No explicit rate limiting needed**: The 20:1 WebSocket ratio and DO soft limit provide natural throttling

For additional protection, you could add:
- Per-IP connection limits (track in DO)
- Topic subscription limits
- Message size limits (already 32MB max)

## Setup Instructions

### Prerequisites

```bash
# Install Wrangler CLI
npm install -g wrangler

# Login to Cloudflare
wrangler login
```

### Development

```bash
cd spikes/cloudflare-signaling

# Install dependencies (if any)
pnpm install

# Run locally with Wrangler
wrangler dev
```

Local development runs at `ws://localhost:4444` (configurable in `wrangler.toml`).

### Deployment

```bash
# Deploy to production
wrangler deploy

# Deploy to staging
wrangler deploy --env staging
```

After deployment, update the web app:
```env
# apps/web/.env.production
VITE_WEBRTC_SIGNALING=wss://shipyard-signaling.<your-subdomain>.workers.dev
```

### Custom Domain (Optional)

1. Add domain to Cloudflare DNS
2. Uncomment routes in `wrangler.toml`
3. Set up SSL (automatic with Cloudflare)

## Testing

### Manual WebSocket Test

```javascript
// In browser console
const ws = new WebSocket('ws://localhost:4444');

ws.onopen = () => {
  console.log('Connected');
  ws.send(JSON.stringify({ type: 'subscribe', topics: ['test-room'] }));
};

ws.onmessage = (e) => console.log('Received:', e.data);

// Simulate peer signaling
ws.send(JSON.stringify({
  type: 'publish',
  topic: 'test-room',
  from: 'peer-1',
  signal: { type: 'offer', sdp: '...' }
}));
```

### Integration Test

Connect the web app to the local Wrangler dev server:
```env
# apps/web/.env.local
VITE_WEBRTC_SIGNALING=ws://localhost:4444
```

Then test P2P connection between two browser windows.

## Limitations & Considerations

### Known Limitations

1. **Single Region Execution**: While routed from edge, the DO runs in one region (typically nearest to first connection)
2. **No Outgoing Hibernation**: Only incoming WebSockets can hibernate (not relevant for signaling)
3. **State Reconstruction**: On wake from hibernation, topic map must be rebuilt from WebSocket attachments

### Potential Improvements

1. **Per-Topic DOs**: Create separate DOs per plan ID for better isolation
   ```typescript
   const roomId = env.SIGNALING_ROOM.idFromName(`plan:${planId}`);
   ```

2. **Authentication**: Add password/token validation in `handleSubscribe`
   ```typescript
   if (message.password !== expectedPassword) {
     ws.close(4001, 'Unauthorized');
   }
   ```

3. **Metrics**: Add analytics for connection counts, message rates

## Files

```
spikes/cloudflare-signaling/
├── wrangler.toml      # Cloudflare configuration
├── src/
│   ├── index.ts       # Worker entry point
│   └── signaling.ts   # Durable Object implementation
└── README.md          # This file
```

## References

- [Cloudflare Durable Objects](https://developers.cloudflare.com/durable-objects/)
- [WebSocket Hibernation API](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)
- [Durable Objects Pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)
- [y-webrtc GitHub](https://github.com/yjs/y-webrtc)
- [Current Node.js Signaling Server](../../apps/signaling/src/server.js)

## Decision

**Recommendation**: Deploy to Cloudflare Workers for:
- Zero idle cost with hibernation
- Global edge routing
- Built-in DDoS protection
- Simpler deployment (no container management)

The free tier should handle shipyard's expected load easily. The $5/month paid tier provides massive headroom if needed.
