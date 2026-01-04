# Signaling Server

WebRTC signaling server for P2P peer discovery in peer-plan.

## What It Does

Helps browsers find each other to establish direct WebRTC P2P connections:
1. Browser A joins room `peer-plan-{planId}`
2. Browser B joins same room
3. Signaling server brokers connection info exchange (ICE candidates)
4. Direct P2P connection established
5. Signaling server no longer needed (but stays connected for new peers)

## Local Development

Already runs with `pnpm dev` (starts on port 4444).

## Production Deployment

**Option 1: Fly.io (Recommended)**
```bash
fly launch
fly deploy
```

**Option 2: Railway**
```bash
railway link
railway up
```

**Option 3: Vercel** (requires adapter for WebSocket support)

## Configuration

Set `VITE_WEBRTC_SIGNALING` in `packages/web/.env`:
```env
# Local
VITE_WEBRTC_SIGNALING=ws://localhost:4444

# Production
VITE_WEBRTC_SIGNALING=wss://your-signaling.fly.dev
```

## Cost

- **Development**: Free (localhost)
- **Production**: ~$5/month (Fly.io/Railway free tier)

## Security

No sensitive data flows through signaling:
- WebRTC peer connections are encrypted
- Signaling only exchanges connection metadata (ICE candidates)
- Optional: Add password authentication via y-webrtc `password` option

## Source

Based on y-webrtc's reference implementation (139 lines).
