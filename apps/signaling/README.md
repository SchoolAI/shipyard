# Signaling Server

WebRTC signaling server for P2P peer discovery in peer-plan.

## What It Does

Helps browsers find each other to establish direct WebRTC P2P connections:
1. Browser A joins room `peer-plan-{planId}`
2. Browser B joins same room
3. Signaling server brokers connection info exchange (ICE candidates)
4. Direct P2P connection established
5. Signaling server no longer needed (but stays connected for new peers)

## Two Implementations

| Implementation | Use Case | Cost | Location |
|----------------|----------|------|----------|
| **Node.js** | Local development | Free | `src/server.js` |
| **Cloudflare Workers** | Production | Free (with hibernation) | `cloudflare/` |

Both implement the same y-webrtc signaling protocol and are interchangeable.

## Local Development

```bash
# From project root
pnpm dev:signaling

# Server starts on ws://localhost:4444
```

Uses the Node.js implementation (`src/server.js`).

## Production Deployment (Cloudflare Workers)

**Deployed:** `wss://peer-plan-signaling.jacob-191.workers.dev`

**Why Cloudflare:**
- Zero cost with WebSocket Hibernation (idle connections don't count)
- Built-in DDoS protection and rate limiting
- Global edge distribution (300+ locations)
- No container management

### Deploy to Production

```bash
cd cloudflare

# First time: login to Cloudflare
npx wrangler login

# Deploy
npx wrangler deploy

# View logs
npx wrangler tail
```

Auto-deploys via GitHub Actions on push to `main`.

### Update Web App

After deployment, update the web app:

```env
# apps/web/.env.production
VITE_WEBRTC_SIGNALING=wss://peer-plan-signaling.jacob-191.workers.dev
```

## Configuration

| Environment | URL |
|-------------|-----|
| Local Development | `ws://localhost:4444` |
| Production | `wss://peer-plan-signaling.jacob-191.workers.dev` |

## WebSocket Hibernation

The Cloudflare Workers implementation uses the [WebSocket Hibernation API](https://developers.cloudflare.com/durable-objects/best-practices/websockets/) which:

1. **Keeps connections open** while the Durable Object sleeps
2. **Wakes on message** - DO loads into memory when a message arrives
3. **Zero cost when idle** - Only billed for active processing time
4. **State survives** - Connection subscriptions persist via `serializeAttachment()`

For signaling, this means:
- Connection open for 1 hour, active for 5 seconds = billed for 5 seconds
- Typical signaling session: ~10-20 messages over 2-5 seconds
- Free tier supports 100,000+ signaling sessions/day

## Cost Comparison

| Platform | Monthly Cost | Idle Cost | Why |
|----------|--------------|-----------|-----|
| Fly.io/Railway | ~$5-10 | Charged | Always-on VM |
| Cloudflare Workers | $0 (free tier) | $0 | Hibernation |

## Security

No sensitive data flows through signaling:
- WebRTC peer connections are encrypted end-to-end
- Signaling only exchanges connection metadata (ICE candidates)
- Signaling server cannot see plan content or user data

Optional security enhancements:
- y-webrtc `password` option for room encryption
- JWT validation in signaling server

## Public Servers Status

All public y-webrtc signaling servers are down (tested January 2026):
- `wss://signaling.yjs.dev` - DNS not found
- `wss://y-webrtc-signaling-*.herokuapp.com` - 404 (Heroku free tier discontinued)

See `../../spikes/public-signaling-test/` for test results.

## References

- [Cloudflare Durable Objects WebSocket API](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)
- [y-webrtc GitHub](https://github.com/yjs/y-webrtc)
- [Spike comparison](../../spikes/SIGNALING-COMPARISON.md) - Research on all deployment options
