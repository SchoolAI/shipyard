# Production Deployment Checklist

## Current Status

✅ **Deployed and working:** `wss://peer-plan-signaling.jacob-191.workers.dev`
✅ **GitHub Actions workflow:** `.github/workflows/deploy-signaling.yml`
✅ **Web app configured:** Uses Cloudflare Workers by default

---

## One-Time Setup Required

### 1. Create Cloudflare API Token

**You need to add this GitHub secret for auto-deployment:**

1. Go to [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens)
2. Click **Create Token**
3. Use template: **Edit Cloudflare Workers**
4. Permissions required:
   - Account → Workers Scripts → Edit
   - Account → Durable Objects → Write
5. Copy the token
6. Go to [GitHub Secrets](https://github.com/SchoolAI/peer-plan/settings/secrets/actions)
7. Click **New repository secret**
   - Name: `CLOUDFLARE_API_TOKEN`
   - Value: [paste token]

### 2. Verify Deployment Works

After adding the secret, test the GitHub Action:

```bash
# Make a small change to trigger workflow
echo "# Test" >> apps/signaling/cloudflare/README.md
git add apps/signaling/cloudflare/README.md
git commit -m "test: trigger signaling deployment"
git push
```

Check workflow at: https://github.com/SchoolAI/peer-plan/actions

---

## Moving to SchoolAI Organization Account (Optional)

Currently deployed on jacob@schoolai.com personal account. To move to SchoolAI organization:

### 1. Update Account ID

Edit `wrangler.toml`:
```toml
account_id = "c0919df946085842429c15f17dfc46ee"  # SchoolAI
```

### 2. Set Up workers.dev Subdomain

1. Go to [SchoolAI Cloudflare Dashboard](https://dash.cloudflare.com/c0919df946085842429c15f17dfc46ee)
2. Click **Workers & Pages** (auto-creates subdomain)
3. Note the subdomain (e.g., `schoolai-xyz.workers.dev`)

### 3. Create API Token

Same as above, but use SchoolAI account when creating token.

### 4. Deploy

```bash
cd apps/signaling/cloudflare
npx wrangler deploy
```

New URL will be: `wss://peer-plan-signaling.<schoolai-subdomain>.workers.dev`

### 5. Update Web App

```typescript
// apps/web/src/hooks/useMultiProviderSync.ts
const DEFAULT_SIGNALING_SERVER = 'wss://peer-plan-signaling.<schoolai-subdomain>.workers.dev';
```

---

## Monitoring & Maintenance

### View Logs

```bash
cd apps/signaling/cloudflare
npx wrangler tail
```

Or view in [Cloudflare Dashboard](https://dash.cloudflare.com) → Workers & Pages → peer-plan-signaling → Logs

### Metrics to Watch

- **Requests/day** - Should be < 10K for normal usage
- **Duration (GB-s)** - Should be near-zero with hibernation
- **Errors** - Watch for WebSocket close codes

### Cost Alerts

While Cloudflare doesn't have built-in spending alerts:
1. Set calendar reminder to check dashboard monthly
2. Free tier limits: 100K requests/day, 13K GB-s/day
3. At expected usage (< 2% of limits), cost will remain $0

---

## Scaling Considerations

### Current Setup (Single Global DO)

```typescript
const roomId = env.SIGNALING_ROOM.idFromName('global-signaling');
```

**Pros:**
- Simple
- All peers can discover each other
- Minimal latency (single lookup)

**Limits:**
- Soft limit: 1,000 requests/second
- If exceeded, Cloudflare may throttle

### If Scaling Needed (Per-Plan DOs)

```typescript
// Create DO per plan ID
const planId = getPlanIdFromRequest(request);
const roomId = env.SIGNALING_ROOM.idFromName(`plan:${planId}`);
```

**Benefits:**
- Better isolation (plan rooms are separate)
- Unlimited horizontal scaling (each plan gets its own DO)
- More predictable performance

**Trade-offs:**
- More DO instances = more cold starts
- Requires request parsing to extract plan ID

**When to implement:** If you see >500 concurrent connections or >1K requests/sec.

---

## Security Hardening (Future)

Current implementation has no authentication. For production at scale, consider:

### 1. Token Validation

```typescript
async fetch(request: Request): Promise<Response> {
  const token = request.headers.get('Authorization');
  if (!validateToken(token)) {
    return new Response('Unauthorized', { status: 401 });
  }
  // ... continue with WebSocket upgrade
}
```

### 2. Rate Limiting Per IP

```typescript
const ip = request.headers.get('CF-Connecting-IP');
const key = `ratelimit:${ip}`;
const count = await this.ctx.storage.get(key) || 0;

if (count > 100) {
  return new Response('Too Many Requests', { status: 429 });
}

await this.ctx.storage.put(key, count + 1, { expirationTtl: 60 });
```

### 3. Room Password (y-webrtc built-in)

```typescript
// In web app
new WebrtcProvider('peer-plan-abc123', doc, {
  signaling: ['wss://peer-plan-signaling.jacob-191.workers.dev'],
  password: 'secure-room-password', // Encrypts signaling messages
});
```

---

## Troubleshooting

### WebSocket Connection Fails

1. **Check URL protocol:** Must be `wss://` not `https://`
2. **Test with script:**
   ```bash
   cd spikes/public-signaling-test
   node test-connection.js wss://peer-plan-signaling.jacob-191.workers.dev
   ```
3. **Check Cloudflare Dashboard** for errors

### Deployment Fails in GitHub Actions

1. **Verify secret exists:** Settings → Secrets → `CLOUDFLARE_API_TOKEN`
2. **Check token permissions:** Workers Scripts Edit, Durable Objects Write
3. **Check workflow logs:** Actions tab → Deploy Signaling Server

### High Costs (Unexpected)

If you see charges:
1. **Check if hibernation is enabled:** Code has `this.ctx.acceptWebSocket()`
2. **Review Cloudflare metrics:** Look for abnormal request patterns
3. **Check for abuse:** Monitor logs for spam connections

---

## Testing

### Local Test

```bash
# Terminal 1: Start local Node.js signaling
pnpm dev:signaling

# Terminal 2: Test it
cd spikes/public-signaling-test
node test-connection.js ws://localhost:4444
```

### Production Test

```bash
cd spikes/public-signaling-test
node test-connection.js wss://peer-plan-signaling.jacob-191.workers.dev
```

Should show:
```
✅ WORKING: wss://peer-plan-signaling.jacob-191.workers.dev
  Connected: ~400ms
  Ping/Pong: ~25ms
```

---

## Rollback Plan

If Cloudflare Workers has issues:

1. **Deploy Deno version:**
   ```bash
   cd spikes/deno-signaling
   deno deploy main.ts
   ```

2. **Deploy Fly.io version:**
   ```bash
   cd spikes/flyio-signaling
   fly launch
   fly deploy
   ```

3. **Update web app** with new URL

All alternatives are fully tested and ready (see `spikes/` folder).

---

*Last updated: 2026-01-04*
