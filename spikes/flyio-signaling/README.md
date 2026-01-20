# Fly.io Signaling Server Deployment

Deployment configuration for the shipyard WebRTC signaling server on Fly.io with Cloudflare protection.

## Architecture

```
Browser --> Cloudflare (CDN/WAF) --> Fly.io --> Signaling Server
                |
                v
         Rate Limiting
         DDoS Protection
         SSL Termination
```

## Cost Analysis

### Fly.io Costs (Monthly Estimate)

| Component | Specification | Cost |
|-----------|---------------|------|
| VM (shared-1x-256mb) | 256MB RAM, shared CPU | ~$1.94/month (always on) |
| VM with auto-stop | Same, but stops when idle | ~$0.50-1.00/month (low traffic) |
| Stopped VM storage | ~50MB rootfs | ~$0.01/month |
| Bandwidth | First 100GB free, then $0.02/GB | $0 (signaling is tiny) |

**Estimated monthly cost for low traffic (<100 concurrent): $0.50-2.00/month**

With `auto_stop_machines = 'stop'` and `min_machines_running = 0`, you only pay when the server is actually handling connections. For a signaling server that's only used during active shipyard sessions, this could be as low as a few cents.

### Cloudflare Costs

| Plan | Cost | WebSocket Support | Rate Limiting |
|------|------|-------------------|---------------|
| Free | $0 | Yes (basic) | 1 rule |
| Pro | $20/month | Yes | 10 rules |

**Recommendation: Free tier is sufficient** for low-traffic signaling. WebSocket connections are supported on all plans.

## Setup Instructions

### Prerequisites

1. [Fly.io account](https://fly.io)
2. [Fly CLI installed](https://fly.io/docs/getting-started/installing-flyctl/)
3. Cloudflare account with a domain

### Step 1: Deploy to Fly.io

```bash
# From the apps/signaling directory
cd apps/signaling

# Copy the Dockerfile from this spike
cp ../../spikes/flyio-signaling/Dockerfile .
cp ../../spikes/flyio-signaling/fly.toml .

# Login to Fly.io
fly auth login

# Launch the app (first time)
fly launch --no-deploy

# Deploy
fly deploy

# Verify it's running
fly status
```

After deployment, your server will be available at: `wss://shipyard-signaling.fly.dev`

### Step 2: Configure Custom Domain (Optional)

If you want to use your own domain (e.g., `wss://signal.yourdomain.com`):

```bash
# Add custom domain certificate
fly certs add signal.yourdomain.com

# Get the certificate details (note the validation CNAME)
fly certs show signal.yourdomain.com
```

### Step 3: Configure Cloudflare

#### A. Add DNS Records

In Cloudflare Dashboard > DNS:

1. **Validation CNAME** (required for SSL cert):
   ```
   Type: CNAME
   Name: _acme-challenge.signal
   Target: <value from fly certs show>
   Proxy: OFF (grey cloud) <-- IMPORTANT
   ```

2. **App AAAA Record**:
   ```
   Type: AAAA
   Name: signal
   Target: <IPv6 from fly ips list>
   Proxy: ON (orange cloud)
   ```

Get your IPv6 address:
```bash
fly ips list
# Look for the v6 address, e.g., 2a09:8280:1::1:abcd
```

#### B. SSL/TLS Settings

In Cloudflare Dashboard > SSL/TLS:
- Set mode to **Full (strict)**

In Cloudflare Dashboard > SSL/TLS > Edge Certificates:
- Enable **Always Use HTTPS**

#### C. Enable WebSockets

In Cloudflare Dashboard > Network:
- Toggle **WebSockets** to ON

#### D. Rate Limiting (Cloudflare Free Tier)

In Cloudflare Dashboard > Security > WAF > Rate limiting rules:

Create a rule to limit connection attempts:

```
Rule name: Limit signaling connections
If incoming requests match: (http.host eq "signal.yourdomain.com")
Rate: 30 requests per 10 seconds
Action: Block for 60 seconds
```

Note: This limits the initial WebSocket upgrade requests, not messages within established connections.

For more aggressive protection (Pro plan required):
- Multiple rules for different thresholds
- Country-based rate limits
- Bot protection

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `4444` | Server port (set to 8080 in fly.toml) |
| `NODE_ENV` | `development` | Set to `production` on Fly.io |

### Web App Configuration

Update your web app to use the deployed signaling server:

```env
# apps/web/.env.production
VITE_WEBRTC_SIGNALING=wss://shipyard-signaling.fly.dev

# Or with custom domain:
VITE_WEBRTC_SIGNALING=wss://signal.yourdomain.com
```

## Auto-Stop Behavior

With the current configuration:
- Server **stops automatically** after a few minutes of no connections
- Server **starts automatically** when a new connection arrives
- Startup time: ~1-2 seconds (Node.js Alpine is fast)
- No connections lost: Fly.io proxy buffers the initial request

This is ideal for development/low-traffic scenarios. For production with consistent traffic, set `min_machines_running = 1`.

## Monitoring

```bash
# View logs
fly logs

# Check status
fly status

# View metrics
fly dashboard
```

## Scaling (If Needed)

For higher traffic, you can:

1. **Increase concurrency**:
   ```toml
   [http_service.concurrency]
     hard_limit = 1000
     soft_limit = 800
   ```

2. **Add more memory**:
   ```toml
   [[vm]]
     memory = '512mb'
   ```

3. **Add more machines**:
   ```bash
   fly scale count 2
   ```

4. **Add regions**:
   ```bash
   fly regions add ord  # Chicago
   fly regions add ams  # Amsterdam
   ```

## Troubleshooting

### WebSocket Connection Fails with 404

- Ensure Cloudflare WebSockets is enabled
- Check SSL mode is "Full (strict)"
- Verify the AAAA record uses IPv6 (not CNAME)

### Connection Times Out

- Check if machine is stopped: `fly status`
- First connection after idle may take 1-2 seconds
- Ensure `auto_start_machines = true`

### Certificate Errors

- Verify validation CNAME has proxy OFF
- Wait up to 24 hours for cert issuance
- Check: `fly certs check signal.yourdomain.com`

## Security Notes

The signaling server only exchanges WebRTC connection metadata (ICE candidates). It does not see:
- Plan content
- User data
- WebRTC media/data streams

Even without authentication, the worst case is someone could discover active plan IDs (which are random UUIDs) but could not access plan content without connecting via WebRTC.

For additional security:
- y-webrtc supports a `password` option for room authentication
- Could add JWT validation in the signaling server upgrade handler

## References

- [Fly.io WebSocket Support](https://fly.io/blog/websockets-and-fly/)
- [Fly.io Auto-stop/Auto-start](https://fly.io/docs/launch/autostop-autostart/)
- [Fly.io Pricing](https://fly.io/docs/about/pricing/)
- [Cloudflare WebSocket Config](https://developers.cloudflare.com/network/websockets/)
- [Cloudflare Rate Limiting](https://developers.cloudflare.com/waf/rate-limiting-rules/)
- [Fly.io + Cloudflare Setup](https://fly.io/docs/networking/understanding-cloudflare/)
