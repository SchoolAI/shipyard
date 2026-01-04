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

### One-Time Setup

**1. Create Cloudflare API Token** (for GitHub Actions auto-deploy):

1. Go to [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens)
2. Create token with template: **Edit Cloudflare Workers**
3. Permissions: Workers Scripts Edit, Durable Objects Write
4. Add to [GitHub Secrets](https://github.com/SchoolAI/peer-plan/settings/secrets/actions):
   - Name: `CLOUDFLARE_API_TOKEN`
   - Value: [paste token]

**2. Manual Deploy** (first time or when testing):

```bash
cd cloudflare

# Login to Cloudflare
npx wrangler login

# Deploy
npx wrangler deploy
```

**3. Auto-Deploy:** On push to `main`, GitHub Actions deploys automatically (see `.github/workflows/deploy-signaling.yml`)

### Monitoring

```bash
# View live logs
cd cloudflare
npx wrangler tail

# Check deployment status
npx wrangler deployments list
```

Dashboard: [Cloudflare Workers](https://dash.cloudflare.com) → peer-plan-signaling → Metrics

### Moving to SchoolAI Account (Optional)

Currently on jacob@schoolai.com personal account. To move to organization:

1. Update `cloudflare/wrangler.toml`:
   ```toml
   account_id = "c0919df946085842429c15f17dfc46ee"  # SchoolAI
   ```
2. Set up workers.dev subdomain at SchoolAI account
3. Create new API token for SchoolAI account
4. Deploy: `npx wrangler deploy`
5. Update web app URL in `apps/web/src/hooks/useMultiProviderSync.ts`

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

## Troubleshooting

### WebSocket Connection Fails

1. Check URL protocol: Must be `wss://` not `https://`
2. Test connection:
   ```bash
   cd ../../spikes/public-signaling-test
   node test-connection.js wss://peer-plan-signaling.jacob-191.workers.dev
   ```
3. Check [Cloudflare Dashboard](https://dash.cloudflare.com) for errors

### GitHub Actions Deployment Fails

1. Verify secret exists: Settings → Secrets → `CLOUDFLARE_API_TOKEN`
2. Check token permissions: Workers Scripts Edit, Durable Objects Write
3. Review workflow logs in Actions tab

## References

- [Cloudflare Durable Objects WebSocket API](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)
- [y-webrtc GitHub](https://github.com/yjs/y-webrtc)
- [Spike comparison](../../spikes/SIGNALING-COMPARISON.md) - Research on all deployment options
