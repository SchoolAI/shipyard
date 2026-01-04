# Signaling Server Deployment Comparison

Research and findings from evaluating deployment options for the peer-plan WebRTC signaling server.

**Date:** January 4, 2026
**Context:** All public y-webrtc signaling servers are down. We need to deploy our own.

---

## Executive Summary

| Platform | Cost | Setup | Rate Limiting | Chosen |
|----------|------|-------|---------------|--------|
| **Cloudflare Workers** | $0 | Medium | Built-in DDoS | ✅ YES |
| Deno Deploy | $0 | Low | Manual | - |
| Fly.io + Cloudflare | ~$2/mo | Medium | Via Cloudflare | - |
| Public Servers | N/A | N/A | N/A | ❌ All dead |

**Decision:** Deploy to Cloudflare Workers with Durable Objects and WebSocket Hibernation.

**Deployed URL:** `wss://peer-plan-signaling.jacob-191.workers.dev`

---

## Public Servers Test Results

All three known public y-webrtc signaling servers are **non-functional** (tested January 2026):

| Server | Status | Error |
|--------|--------|-------|
| `wss://signaling.yjs.dev` | ❌ DEAD | DNS lookup fails (domain not resolving) |
| `wss://y-webrtc-signaling-us.herokuapp.com` | ❌ DEAD | 404 (app removed) |
| `wss://y-webrtc-signaling-eu.herokuapp.com` | ❌ DEAD | 404 (app removed) |

**Conclusion:** Must deploy our own signaling server.

**Spike:** `spikes/public-signaling-test/` - Node.js test script with full results

---

## Option 1: Cloudflare Workers + Durable Objects ⭐ (CHOSEN)

**Spike:** `spikes/cloudflare-signaling/` → **Moved to:** `apps/signaling/cloudflare/`

### Why We Chose It

1. **Zero cost** - WebSocket Hibernation means idle connections are free
2. **Company already uses Cloudflare** - No new vendor relationships
3. **Built-in protection** - DDoS, rate limiting, global edge
4. **Best for signaling** - Idle connections don't cost anything

### WebSocket Hibernation Magic

```
Without Hibernation (Fly.io):
Connection open 1 hour = 1 hour of billing

With Hibernation (Cloudflare):
Connection open 1 hour, active 5 seconds = 5 seconds of billing
```

For signaling (brief bursts of activity, then idle):
- Typical session: 10-20 messages over 2-5 seconds
- Connection stays open for new peers
- **Hibernation saves ~99.9% of compute costs**

### Cost Analysis

| Resource | Free Tier | What This Means |
|----------|-----------|-----------------|
| Requests | 100,000/day | ~2M WebSocket messages/day (20:1 ratio) |
| Duration | 13,000 GB-s/day | Hibernation makes this near-zero |
| Storage | 5 GB | Not used (stateless) |

**For peer-plan:**
- Estimated usage: 15,000 connections/month
- **Uses < 2% of free tier limits**
- Would need 200K+ plan reviews/month to exceed free tier

### Implementation Details

**Architecture:**
```
Browser A ───┐
Browser B ───┼──► Worker (edge) ──► Durable Object (stateful singleton)
Browser C ───┘                      └─ WebSocket connections + topics Map
```

**Key APIs:**
```typescript
// Worker entry (src/index.ts) - routes to DO
const roomId = env.SIGNALING_ROOM.idFromName('global-signaling');
const room = env.SIGNALING_ROOM.get(roomId);
return room.fetch(request);

// Durable Object (src/signaling.ts) - handles WebSockets
this.ctx.acceptWebSocket(server);              // Enable hibernation
ws.serializeAttachment(state);                 // Persist state
async webSocketMessage(ws, message) { }        // Wakes on message
```

### Deployment

**Manual:**
```bash
cd apps/signaling/cloudflare
npx wrangler deploy
```

**Auto-deploy:** GitHub Actions on push to `main` (`.github/workflows/deploy-signaling.yml`)

### Rate Limiting

Built-in protections:
- 1,000 requests/second soft limit per Durable Object
- DDoS protection at edge
- Message size limit: 1 MiB

No additional rate limiting needed for expected usage.

### Test Results

```
✅ WORKING: wss://peer-plan-signaling.jacob-191.workers.dev
  Connected: 428ms
  Ping/Pong: 25ms
```

### Production Considerations

1. **Account:** Currently on jacob@schoolai.com personal account
   - Consider moving to SchoolAI organization account for production
   - Update `account_id` in `wrangler.toml`

2. **Monitoring:** View metrics at [Cloudflare Dashboard](https://dash.cloudflare.com/191909c2c1a28f6cb73d12e3362b874c/workers)

3. **Secrets:** For CLOUDFLARE_API_TOKEN in GitHub Actions:
   - Generate API token at [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens)
   - Permissions: Workers Scripts Edit, Durable Objects Write
   - Add to GitHub repo secrets

---

## Option 2: Deno Deploy

**Spike:** `spikes/deno-signaling/`

### Pros

- Very generous free tier (1M requests, 100GB bandwidth)
- Minimal code changes from Node.js (just runtime swap)
- Zero config deployment
- Global edge (35+ locations)

### Cons

- New vendor (not using Cloudflare already)
- No built-in rate limiting (must implement)
- No hibernation (charges for connection duration)
- Connections reset when isolate restarts

### Cost Analysis

Free tier: 1M requests, 100GB bandwidth/month

For peer-plan:
- 15,000 connections/month = 1.5% of request budget
- Bandwidth: 375MB = 0.4% of bandwidth budget
- **Effectively free**

### Code Changes

Minimal - ported in ~1 hour:
- `ws` library → `Deno.upgradeWebSocket()` (built-in)
- `http.createServer()` → `Deno.serve()` (built-in)
- No dependencies needed

### When to Consider

- If Cloudflare Workers fails or becomes problematic
- If you want simpler code (no Durable Objects complexity)
- If free tier + no vendor lock-in is priority

---

## Option 3: Fly.io + Cloudflare Proxy

**Spike:** `spikes/flyio-signaling/`

### Pros

- Deploy Node.js as-is (no code changes)
- Auto-stop reduces costs when idle
- Cloudflare provides rate limiting and DDoS protection

### Cons

- Costs ~$0.50-2/month even with auto-stop
- Container overhead vs edge functions
- Requires Cloudflare setup for protection

### Cost Analysis

| Component | Cost |
|-----------|------|
| Fly.io VM (256MB shared, auto-stop) | ~$0.50-1/month |
| Cloudflare proxy (free tier) | $0 |
| **Total** | **~$0.50-2/month** |

### Setup Complexity

1. Deploy to Fly.io (`fly deploy`)
2. Configure Cloudflare DNS (AAAA record)
3. Set up rate limiting rules in Cloudflare
4. Configure SSL (Full Strict mode)

### When to Consider

- If you need traditional VM deployment
- If Cloudflare Workers/Deno Deploy fail
- If you want Cloudflare protection but can't rewrite code

---

## Decision Matrix

### Evaluated Criteria

| Criterion | Cloudflare | Deno Deploy | Fly.io |
|-----------|------------|-------------|--------|
| **Cost** | Free | Free | ~$2/mo |
| **Hibernation** | ✅ Yes | ❌ No | ❌ No |
| **Rate Limiting** | ✅ Built-in | ⚠️ Manual | ✅ Via Cloudflare |
| **Code Changes** | Medium | Low | None |
| **Company Uses** | ✅ Yes | ❌ No | ❌ No |
| **Global Edge** | 300+ locations | 35+ locations | Single region |
| **Cold Start** | ~0ms | ~50ms | N/A (always-on) |

### Winner: Cloudflare Workers

**Why:**
1. **Zero cost** - Hibernation eliminates idle charges
2. **Already integrated** - Company uses Cloudflare
3. **Best architecture** - Designed for this exact use case
4. **Built-in protection** - No additional setup needed

---

## Architecture Deep Dive

### How Durable Objects Solve Statelessness

Cloudflare Workers are stateless, but Durable Objects provide **globally unique, stateful singletons**:

```typescript
// Every Worker instance (at any edge location) that calls this
const roomId = env.SIGNALING_ROOM.idFromName('global-signaling');
const room = env.SIGNALING_ROOM.get(roomId);

// Gets the SAME Durable Object instance globally
```

**Cloudflare guarantees:**
1. Only **one instance** of this DO exists worldwide
2. All requests with this ID route to that instance
3. State (WebSocket connections, topics Map) persists in that instance

```
Browser A (San Francisco)  → Worker (SF edge)   ─┐
Browser B (New York)       → Worker (NYC edge)  ─┼→ ONE Durable Object
Browser C (London)         → Worker (LON edge)  ─┘  (holds all state)
```

No database needed - the Durable Object IS the state store.

### Hibernation Lifecycle

```
1. Connection established
   ├─ DO loads into memory
   ├─ this.ctx.acceptWebSocket(server)
   └─ WebSocket opens

2. Signaling messages (active)
   ├─ webSocketMessage() fires
   ├─ DO processes subscribe/publish
   └─ BILLED for this time

3. Idle period (no messages)
   ├─ DO evicted from memory
   ├─ WebSocket stays connected
   └─ BILLED: $0 (hibernating)

4. New message arrives
   ├─ DO wakes up
   ├─ State restored from serializeAttachment()
   └─ Cycle repeats
```

---

## Production Readiness

### Required Setup

- [x] Code deployed to `apps/signaling/cloudflare/`
- [x] GitHub Actions workflow created
- [x] Web app updated with production URL
- [ ] GitHub secret: `CLOUDFLARE_API_TOKEN` (you'll add this)
- [x] Tested and verified working

### Optional Enhancements

Future considerations (not needed now):

1. **Per-plan Durable Objects** - Isolate each plan to its own DO
   ```typescript
   const roomId = env.SIGNALING_ROOM.idFromName(`plan:${planId}`);
   ```

2. **Authentication** - Validate tokens before accepting connections
   ```typescript
   const token = request.headers.get('Authorization');
   if (!validateToken(token)) return new Response('Unauthorized', {status: 401});
   ```

3. **Monitoring** - Add analytics for connection counts, message rates
   ```typescript
   await env.ANALYTICS.writeDataPoint({ connections: this.topics.size });
   ```

4. **Custom domain** - Use `signaling.yourdomain.com` instead of `workers.dev`
   - Uncomment routes in `wrangler.toml`
   - Configure DNS in Cloudflare

---

## Key Learnings

### 1. Public Servers Are Dead

The y-webrtc public signaling infrastructure collapsed after:
- Heroku discontinued free tier (Nov 2022)
- Yjs maintainer "moved on to other projects"
- `signaling.yjs.dev` domain abandoned

**Lesson:** Always deploy your own critical infrastructure.

### 2. Hibernation Changes Economics

Traditional VMs/containers charge for uptime. Hibernation charges for compute.

For workloads with idle periods (chat, signaling, notifications), hibernation can reduce costs by 99%+.

### 3. Durable Objects Are Database-Free State

The "stateless serverless" paradigm breaks down for real-time/WebSocket workloads. Durable Objects provide:
- Single stateful instance per ID
- In-memory state (no database round-trips)
- Hibernation (sleep while idle)

This is fundamentally different from scaling via database-backed stateless functions.

### 4. Vendor Lock-In Trade-Offs

Cloudflare Workers code is proprietary (Durable Objects don't run elsewhere). But:
- The signaling protocol is standard (y-webrtc)
- Could swap to Deno/Fly.io versions if needed
- Lock-in is acceptable for non-critical, replaceable infrastructure

---

## Files Created

### Production Code

| File | Purpose |
|------|---------|
| `apps/signaling/cloudflare/src/index.ts` | Worker entry point |
| `apps/signaling/cloudflare/src/signaling.ts` | Durable Object with hibernation |
| `apps/signaling/cloudflare/wrangler.toml` | Cloudflare config |
| `apps/signaling/cloudflare/package.json` | Dependencies (wrangler, types) |
| `apps/signaling/cloudflare/tsconfig.json` | TypeScript config |
| `.github/workflows/deploy-signaling.yml` | Auto-deploy on push to main |

### Spikes (Research)

| Spike | Purpose |
|-------|---------|
| `spikes/cloudflare-signaling/` | Original prototype (kept for reference) |
| `spikes/deno-signaling/` | Deno Deploy port (backup option) |
| `spikes/flyio-signaling/` | Fly.io + Cloudflare proxy (backup option) |
| `spikes/public-signaling-test/` | Test script proving public servers are dead |
| `spikes/SIGNALING-COMPARISON.md` | This document |

---

## Next Steps (If Moving to SchoolAI Account)

Currently deployed on jacob@schoolai.com's personal account. To move to SchoolAI organization:

1. **Update wrangler.toml:**
   ```toml
   account_id = "c0919df946085842429c15f17dfc46ee"  # SchoolAI
   ```

2. **Generate API token** at SchoolAI account:
   - Permissions: Workers Scripts Edit, Durable Objects Write
   - Add to GitHub secrets as `CLOUDFLARE_API_TOKEN`

3. **Redeploy:**
   ```bash
   cd apps/signaling/cloudflare
   npx wrangler deploy
   ```

4. **Update web app:**
   ```env
   VITE_WEBRTC_SIGNALING=wss://peer-plan-signaling.<schoolai-subdomain>.workers.dev
   ```

---

## Sources

Research compiled from:

- [Fly.io Pricing](https://fly.io/docs/about/pricing/)
- [Fly.io Cost Management](https://fly.io/docs/about/cost-management/)
- [Deno Deploy Pricing](https://deno.com/deploy/pricing)
- [Deno Deploy Free Tier](https://www.freetiers.com/directory/deno-deploy)
- [Cloudflare Durable Objects Pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)
- [Cloudflare Durable Objects Free Tier](https://developers.cloudflare.com/changelog/2025-04-07-durable-objects-free-tier/)
- [WebSocket Hibernation API](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)
- [Cloudflare Workers WebSocket Runtime API](https://developers.cloudflare.com/workers/runtime-apis/websockets/)
- [y-webrtc GitHub](https://github.com/yjs/y-webrtc)
- [Yjs Community Discussion on Public Servers](https://discuss.yjs.dev/t/is-the-public-signaling-server-that-ships-by-default-with-y-webrtc-still-working/1979)

---

## Recommendation Summary

**For peer-plan:**
- ✅ Use Cloudflare Workers (deployed and working)
- ✅ Hibernation enabled (zero idle cost)
- ✅ Free tier sufficient for expected scale
- ✅ Built-in protection, no additional setup

**Backup options:**
- Deno Deploy if Cloudflare becomes problematic (simple port, generous free tier)
- Fly.io if edge functions prove insufficient (traditional VM, ~$2/month)

Both backups are fully researched and ready to deploy if needed (see respective spike folders).
