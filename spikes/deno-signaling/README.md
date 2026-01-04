# Deno Deploy Signaling Server Spike

WebRTC signaling server for peer-plan, ported from Node.js to Deno for deployment on Deno Deploy.

## Why Deno Deploy?

Compared to other deployment options:

| Platform | Free Tier | WebSocket Support | Cold Start | Complexity |
|----------|-----------|-------------------|------------|------------|
| **Deno Deploy** | 1M req, 100GB BW | Native | ~50ms | Very Low |
| Fly.io | 3 shared VMs | Yes | N/A (always on) | Medium |
| Cloudflare Workers | 100K req/day | Durable Objects ($) | ~0ms | High |
| Railway | $5 credit/month | Yes | N/A | Low |

**Deno Deploy wins for signaling because:**
1. Native WebSocket support without adapters
2. Generous free tier (1M requests vs 100K for CF)
3. Zero config deployment
4. Global edge distribution

## Code Changes from Node.js

The port from `apps/signaling/src/server.js` required minimal changes:

| Node.js | Deno |
|---------|------|
| `ws` library | `Deno.upgradeWebSocket()` |
| `http.createServer()` | `Deno.serve()` |
| `lib0/map` | Native `Map` |
| Manual ping/pong interval | Not needed (Deno manages) |
| `process.env.PORT` | Deno Deploy auto-assigns |

**Lines of code:** 139 (Node.js) -> 159 (Deno) - slightly more due to TypeScript types.

## Local Development

```bash
# Install Deno (if not installed)
curl -fsSL https://deno.land/install.sh | sh

# Run locally with auto-reload
deno task dev

# Server starts on http://localhost:8000
```

Test with curl:
```bash
# Health check
curl http://localhost:8000/health

# Stats (topics and connections)
curl http://localhost:8000/stats
```

## Deployment to Deno Deploy

### Option 1: GitHub Integration (Recommended)

1. Push this directory to GitHub
2. Go to [dash.deno.com](https://dash.deno.com)
3. Create new project -> Link GitHub repo
4. Set entrypoint: `spikes/deno-signaling/main.ts`
5. Deploy

Updates deploy automatically on push.

### Option 2: CLI Deployment

```bash
# Install deployctl
deno install -Arf jsr:@deno/deployctl

# Deploy (first time - creates project)
deployctl deploy --project=peer-plan-signaling main.ts

# Subsequent deploys
deployctl deploy main.ts
```

### Option 3: Playground (Quick Test)

1. Go to [dash.deno.com/playground](https://dash.deno.com/playground)
2. Paste `main.ts` content
3. Click "Save & Deploy"

## Configuration

Update the web app to use the deployed signaling server:

```env
# In apps/web/.env.production
VITE_WEBRTC_SIGNALING=wss://peer-plan-signaling.deno.dev
```

## Free Tier Analysis

### Deno Deploy Free Tier Limits

| Resource | Limit | Notes |
|----------|-------|-------|
| Requests | 1M/month | HTTP + WebSocket upgrades |
| Bandwidth | 100GB/month | Egress only |
| CPU Time | 15h/month | Pure CPU, not wall clock |
| Memory | 512MB | Per isolate |
| KV Storage | 1GB | Not used by signaling |

### What This Means for Signaling

**Request budget analysis:**
- 1 WebSocket connection = 1 HTTP request (upgrade)
- Each message over WebSocket = 0 additional requests
- Pure signaling overhead is minimal

**Realistic usage for peer-plan:**
- Assume 1000 unique plans/month (generous)
- Assume 5 reviewers per plan average
- Assume 3 reconnections per session (refreshes, etc.)
- Total connections: 1000 * 5 * 3 = 15,000 connections/month
- **Uses only 1.5% of request budget**

**Bandwidth analysis:**
- Average signaling message: ~500 bytes
- Messages per connection: ~50 (ICE candidates, offers, answers)
- Per connection: 25KB
- 15,000 connections = 375MB/month
- **Uses only 0.4% of bandwidth budget**

**When you'd exceed free tier:**
- ~1M WebSocket connections/month, OR
- ~4M signaling messages/month (at 25KB avg)
- This would require ~200K unique plan reviews/month

### Cost if Exceeding Free Tier

On the Pro tier ($20/month base):
- Additional requests: $2/million
- Additional bandwidth: $0.50/GB

**Realistically:** You'd need significant scale to pay anything. The free tier is very generous for signaling use cases.

## Connection Lifecycle on Deno Deploy

Important considerations:

1. **Edge functions are ephemeral** - connections typically last minutes to ~1 hour
2. **No persistent state** - `topics` Map resets if isolate spins down
3. **Reconnection is expected** - y-webrtc handles this automatically

This is fine for signaling because:
- WebRTC connections establish in seconds
- Once P2P connection is made, signaling isn't needed
- Clients reconnect automatically if signaling drops

## Rate Limiting Options

Deno Deploy doesn't include built-in rate limiting. Options:

### 1. Simple In-Memory (Good for abuse prevention)

```typescript
const connectionCounts = new Map<string, number>();
const MAX_CONNECTIONS_PER_IP = 50;

Deno.serve((req) => {
  const ip = req.headers.get("x-forwarded-for") || "unknown";
  const count = connectionCounts.get(ip) || 0;

  if (count >= MAX_CONNECTIONS_PER_IP) {
    return new Response("Too many connections", { status: 429 });
  }

  connectionCounts.set(ip, count + 1);
  // ... rest of handler
});
```

**Note:** In-memory limits reset when isolate restarts. Good for burst protection, not persistent limits.

### 2. Deno KV Rate Limiting (Persistent)

For persistent rate limiting, use Deno KV (sliding window):

```typescript
const kv = await Deno.openKv();

async function checkRateLimit(ip: string): Promise<boolean> {
  const key = ["ratelimit", ip];
  const window = 60_000; // 1 minute
  const limit = 100; // 100 requests per minute

  const now = Date.now();
  const entry = await kv.get<{ count: number; start: number }>(key);

  if (!entry.value || now - entry.value.start > window) {
    await kv.set(key, { count: 1, start: now }, { expireIn: window });
    return true;
  }

  if (entry.value.count >= limit) {
    return false;
  }

  await kv.set(key, { count: entry.value.count + 1, start: entry.value.start });
  return true;
}
```

**Trade-off:** Adds KV read/write per request (uses KV quota).

### Recommendation

Start without rate limiting. Add simple in-memory protection if you see abuse. Only add KV-based limiting if you need persistent limits.

## Monitoring

### Built-in Stats Endpoint

```bash
curl https://peer-plan-signaling.deno.dev/stats
```

Returns:
```json
{
  "topics": 3,
  "connections": 7,
  "topicList": ["peer-plan-abc123", "peer-plan-def456", "peer-plan-ghi789"]
}
```

### Deno Deploy Dashboard

- Request count and latency
- Error rates
- CPU and memory usage
- Logs (console.log output)

## Comparison with Current Node.js Server

| Aspect | Node.js (current) | Deno Deploy |
|--------|-------------------|-------------|
| Runtime | Node.js 22 | Deno (V8 isolate) |
| Dependencies | ws, lib0 | None (all built-in) |
| Deployment | Fly.io / Railway | Deno Deploy |
| Cost | $5-10/month | Free (for our scale) |
| Cold start | N/A (always on) | ~50ms |
| Global distribution | Single region | 35+ edge locations |
| SSL | Manual / platform | Automatic |

## Next Steps

1. Test locally: `deno task dev`
2. Deploy to Deno Deploy
3. Update `VITE_WEBRTC_SIGNALING` in web app
4. Monitor for a week
5. If stable, migrate from current signaling server

## Sources

Research compiled from:
- [Deno Deploy Pricing](https://deno.com/deploy/pricing)
- [Deno WebSocket Server Example](https://docs.deno.com/examples/http_server_websocket/)
- [Deno Deploy Pricing and Limits](https://docs.deno.com/deploy/pricing_and_limits/)
- [Sliding Window Rate Limiting with Deno KV](https://graham.weblog.lol/2024/02/sliding-window-rate-limiting-with-deno-kv)
