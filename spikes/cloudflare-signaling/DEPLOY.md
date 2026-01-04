# Deployment Guide

## Prerequisites

You must have:
- A Cloudflare account
- Access to create Workers and Durable Objects

## Step 1: Login to Cloudflare

```bash
npx wrangler login
```

This will open a browser window to authorize wrangler with your Cloudflare account.

## Step 2: Deploy

```bash
npx wrangler deploy
```

This will:
1. Bundle the TypeScript code
2. Upload to Cloudflare Workers
3. Create the Durable Object migration
4. Return your worker URL

## Step 3: Get Your Worker URL

After deployment, you'll see:

```
Published peer-plan-signaling (X.XX sec)
  https://peer-plan-signaling.<your-subdomain>.workers.dev
```

Copy this URL.

## Step 4: Configure Web App

Update `apps/web/.env.production`:

```env
VITE_WEBRTC_SIGNALING=wss://peer-plan-signaling.<your-subdomain>.workers.dev
```

Note: Replace `https://` with `wss://` for WebSocket protocol.

## Step 5: Rebuild Web App

```bash
cd apps/web
pnpm build
```

## Verify Deployment

Test the signaling server:

```bash
cd spikes/public-signaling-test
node test-connection.js wss://peer-plan-signaling.<your-subdomain>.workers.dev
```

You should see:

```
Testing: wss://peer-plan-signaling.<your-subdomain>.workers.dev
  Status: SUCCESS
  Connect time: ~50ms
  Ping/Pong time: ~20ms
```

## Monitoring

View logs:
```bash
npx wrangler tail
```

View metrics in Cloudflare Dashboard:
- Workers & Pages → peer-plan-signaling → Metrics

## Cost

- **Free tier**: 100,000 requests/day, hibernation makes this effectively unlimited for signaling
- **Paid tier**: $5/month minimum if you exceed free tier

For peer-plan's expected usage, you'll stay on free tier.

## Troubleshooting

### Error: "No such binding"

If deployment fails with binding errors, ensure:
1. Your Cloudflare account has Durable Objects enabled
2. You're on a paid Workers plan (Durable Objects require at least $5/month plan)

### Error: "A migration is required"

This means the Durable Object migration wasn't applied. Run:
```bash
npx wrangler migrations apply
```

### WebSocket connection fails

Check:
1. URL uses `wss://` not `https://`
2. Worker is actually deployed: `npx wrangler status`
3. Test with the signaling test script from step 5
